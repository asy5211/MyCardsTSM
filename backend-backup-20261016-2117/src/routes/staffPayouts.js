// Staff: what sellers have earned and what TSM owes / has paid them.
//
//   GET  /api/staff/payouts/overview           one row per seller with earnings: available / in payout / paid
//   GET  /api/staff/payouts                    ?status=all|pending|paid|cancelled, sellerId, limit, offset
//   GET  /api/staff/payouts/:id                one payout with the sales it covers
//   POST /api/staff/payouts                    {sellerId, note?}  bundles ALL the seller's available earnings
//   POST /api/staff/payouts/:id/mark-paid      {reference, note?} after the money was actually sent
//   POST /api/staff/payouts/:id/cancel         {reason}           frees the earnings so they can be bundled again
//   GET  /api/staff/earnings                   ?sellerId, status, limit, offset  (the ledger of every sale)
//
// TSM sends the money outside this system (bank / Shopify) and records it here. Reading is open to
// every staff role; creating, paying and cancelling need "admin" or "super_admin".
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { earningDto, earningTotals, payoutDto } from '../lib/earnings.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();
const read = requireStaff();
const write = requireStaff('super_admin', 'admin');
const actor = (req) => ({ actorType: 'staff', actorId: req.staff.id, ip: req.ip });
function idParam(req) {
  if (!UUID_RE.test(req.params.id)) throw notFound();
  return req.params.id;
}
const page = { limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) };

router.get('/payouts/overview', read, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT sp.user_id, sp.display_name, sp.status AS seller_status, u.email, m.display_label AS method_label,
            COALESCE(SUM(CASE WHEN e.status = 'available' THEN e.net_cents END), 0) AS available,
            COALESCE(SUM(CASE WHEN e.status = 'in_payout' THEN e.net_cents END), 0) AS in_payout,
            COALESCE(SUM(CASE WHEN e.status = 'paid'      THEN e.net_cents END), 0) AS paid,
            COALESCE(SUM(CASE WHEN e.status <> 'reversed' THEN e.gross_cents END), 0) AS gross,
            COALESCE(SUM(CASE WHEN e.status <> 'reversed' THEN e.commission_cents END), 0) AS commission,
            COALESCE(SUM(CASE WHEN e.status <> 'reversed' THEN e.processing_fee_cents END), 0) AS processing
       FROM seller_profiles sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN seller_payout_methods m ON m.seller_id = sp.user_id
       LEFT JOIN seller_earnings e ON e.seller_id = sp.user_id
      GROUP BY sp.user_id, sp.display_name, sp.status, u.email, m.display_label
      ORDER BY available DESC, sp.display_name`,
  );
  const totals = await earningTotals();
  res.json({
    totals,
    sellers: rows.map((r) => ({
      sellerId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      sellerStatus: r.seller_status,
      availableCents: Number(r.available),
      inPayoutCents: Number(r.in_payout),
      paidCents: Number(r.paid),
      grossCents: Number(r.gross),
      commissionCents: Number(r.commission),
      processingFeeCents: Number(r.processing),
      payoutMethod: r.method_label ?? null,
    })),
  });
});

router.get('/payouts', read, async (req, res) => {
  const f = parse(
    z.object({ status: z.enum(['all', 'pending', 'paid', 'cancelled']).default('all'), sellerId: z.string().regex(UUID_RE).optional(), ...page }),
    req.query,
  );
  const where = [];
  const params = [];
  if (f.status !== 'all') { where.push('p.status = ?'); params.push(f.status); }
  if (f.sellerId) { where.push('p.seller_id = ?'); params.push(f.sellerId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM payouts p ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT p.*, sp.display_name FROM payouts p JOIN seller_profiles sp ON sp.user_id = p.seller_id
      ${whereSql} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset],
  );
  res.json({ items: rows.map(payoutDto), total: Number(total), limit: f.limit, offset: f.offset });
});

router.get('/payouts/:id', read, async (req, res) => {
  const id = idParam(req);
  const [[row]] = await pool.query(
    'SELECT p.*, sp.display_name FROM payouts p JOIN seller_profiles sp ON sp.user_id = p.seller_id WHERE p.id = ?', [id]);
  if (!row) throw notFound('Payout not found');
  const [earnings] = await pool.query('SELECT * FROM seller_earnings WHERE payout_id = ? ORDER BY created_at, id', [id]);
  res.json({ ...payoutDto(row), earnings: earnings.map(earningDto) });
});

router.post('/payouts', write, async (req, res) => {
  const body = parse(
    z.object({
      sellerId: z.string({ error: 'Choose a seller' }).regex(UUID_RE, 'Choose a seller'),
      note: z.string().trim().max(255).optional(),
    }),
    req.body,
  );
  const [[seller]] = await pool.query('SELECT user_id, display_name FROM seller_profiles WHERE user_id = ?', [body.sellerId]);
  if (!seller) throw notFound('Seller not found');

  const created = await withTransaction(async (conn) => {
    // Lock the seller's available earnings so two staff clicking at once cannot pay the same sale twice.
    const [lines] = await conn.query(
      "SELECT id, net_cents FROM seller_earnings WHERE seller_id = ? AND status = 'available' FOR UPDATE", [body.sellerId]);
    if (!lines.length) throw conflict('This seller has nothing available to pay out');
    const amount = lines.reduce((sum, l) => sum + Number(l.net_cents), 0);
    const payoutId = randomUUID();
    await conn.query(
      `INSERT INTO payouts (id, seller_id, amount_cents, earnings_count, status, note, created_by_staff_id)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [payoutId, body.sellerId, amount, lines.length, body.note || null, req.staff.id],
    );
    // Second safety net behind the row lock: only sales that are still "available" can move into a payout.
    const [moved] = await conn.query(
      "UPDATE seller_earnings SET status = 'in_payout', payout_id = ? WHERE id IN (?) AND status = 'available'",
      [payoutId, lines.map((l) => l.id)],
    );
    if (moved.affectedRows !== lines.length) throw conflict('Those sales were just paid out by someone else. Refresh and try again.');
    return { payoutId, amount, count: lines.length };
  });
  await audit({
    ...actor(req), action: 'payout.created', entityType: 'payout', entityId: created.payoutId,
    details: { seller: seller.display_name, sellerId: body.sellerId, amountCents: created.amount, sales: created.count },
  });
  const [[row]] = await pool.query(
    'SELECT p.*, sp.display_name FROM payouts p JOIN seller_profiles sp ON sp.user_id = p.seller_id WHERE p.id = ?', [created.payoutId]);
  res.status(201).json(payoutDto(row));
});

router.post('/payouts/:id/mark-paid', write, async (req, res) => {
  const id = idParam(req);
  const body = parse(
    z.object({
      reference: z.string({ error: 'Enter the transfer reference' }).trim().min(3, 'Enter the bank or Shopify transfer reference').max(120),
      note: z.string().trim().max(255).optional(),
    }),
    req.body,
  );
  const result = await withTransaction(async (conn) => {
    const [[payout]] = await conn.query('SELECT * FROM payouts WHERE id = ? FOR UPDATE', [id]);
    if (!payout) throw notFound('Payout not found');
    if (payout.status !== 'pending') throw conflict(`This payout is already ${payout.status}`);
    await conn.query(
      "UPDATE payouts SET status = 'paid', reference = ?, note = COALESCE(?, note), paid_at = NOW(3), paid_by_staff_id = ? WHERE id = ?",
      [body.reference, body.note || null, req.staff.id, id],
    );
    await conn.query("UPDATE seller_earnings SET status = 'paid' WHERE payout_id = ? AND status = 'in_payout'", [id]);
    return payout;
  });
  await audit({
    ...actor(req), action: 'payout.paid', entityType: 'payout', entityId: id,
    details: { sellerId: result.seller_id, amountCents: result.amount_cents, reference: body.reference },
  });
  const [[row]] = await pool.query(
    'SELECT p.*, sp.display_name FROM payouts p JOIN seller_profiles sp ON sp.user_id = p.seller_id WHERE p.id = ?', [id]);
  res.json(payoutDto(row));
});

router.post('/payouts/:id/cancel', write, async (req, res) => {
  const id = idParam(req);
  const { reason } = parse(
    z.object({ reason: z.string({ error: 'Give a reason' }).trim().min(3, 'Give a short reason (at least 3 characters)').max(255) }),
    req.body,
  );
  const result = await withTransaction(async (conn) => {
    const [[payout]] = await conn.query('SELECT * FROM payouts WHERE id = ? FOR UPDATE', [id]);
    if (!payout) throw notFound('Payout not found');
    if (payout.status !== 'pending') {
      throw new HttpError(409, 'conflict', payout.status === 'paid' ? 'A payout that was already paid cannot be cancelled' : 'This payout is already cancelled');
    }
    await conn.query("UPDATE payouts SET status = 'cancelled', cancelled_at = NOW(3), note = ? WHERE id = ?", [reason, id]);
    await conn.query("UPDATE seller_earnings SET status = 'available', payout_id = NULL WHERE payout_id = ? AND status = 'in_payout'", [id]);
    return payout;
  });
  await audit({
    ...actor(req), action: 'payout.cancelled', entityType: 'payout', entityId: id,
    details: { sellerId: result.seller_id, amountCents: result.amount_cents, reason },
  });
  const [[row]] = await pool.query(
    'SELECT p.*, sp.display_name FROM payouts p JOIN seller_profiles sp ON sp.user_id = p.seller_id WHERE p.id = ?', [id]);
  res.json(payoutDto(row));
});

router.get('/earnings', read, async (req, res) => {
  const f = parse(
    z.object({
      sellerId: z.string().regex(UUID_RE).optional(),
      status: z.enum(['all', 'available', 'in_payout', 'paid', 'reversed']).default('all'),
      ...page,
    }),
    req.query,
  );
  const where = [];
  const params = [];
  if (f.sellerId) { where.push('e.seller_id = ?'); params.push(f.sellerId); }
  if (f.status !== 'all') { where.push('e.status = ?'); params.push(f.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM seller_earnings e ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT e.*, sp.display_name FROM seller_earnings e JOIN seller_profiles sp ON sp.user_id = e.seller_id
      ${whereSql} ORDER BY e.created_at DESC, e.id LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset],
  );
  res.json({ items: rows.map((r) => ({ ...earningDto(r), sellerName: r.display_name })), total: Number(total), limit: f.limit, offset: f.offset });
});

export default router;
