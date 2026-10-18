// The seller portal's selling side: what was sold, shipping, buyer messages, reviews, sales rates, payout method.
//
//   GET  /api/seller/orders                     ?status=all|placed|shipped|delivered|cancelled, q, sort=newest|oldest, limit, offset  items I sold
//   GET  /api/seller/orders/:id                 one sold order (buyer's username and shipping address)
//   POST /api/seller/orders/:id/ship            {carrier, trackingNumber}  marks it shipped, or corrects the tracking number
//   GET  /api/seller/orders/:id/messages        the chat with the buyer
//   POST /api/seller/orders/:id/messages        {body}
//   GET  /api/seller/reviews                    ?productId, rating, answered=all|yes|no, sort=newest|oldest, limit, offset  + a summary and a per-product list
//   POST /api/seller/reviews/:id/respond        {response}  answer a review (saving again edits the answer)
//   GET  /api/seller/stats                      ?period=day|week|month|year, count (1-25)   sales and payouts per day / week / month / year
//   GET  /api/seller/payout-method              where TSM pays me (masked: the full details are never sent back)
//   PUT  /api/seller/payout-method              {type: bank_transfer|paypal|zelle|check, accountHolder, ...details}
//   DELETE /api/seller/payout-method
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { MESSAGE_MAX, addMessage, countMessages, listMessages, messageDto } from '../lib/conversations.js';
import { encryptJson } from '../lib/crypto.js';
import { countOrders, loadOrderFor, loadOrders, shipBody, shipOrder } from '../lib/orders.js';
import { formatPhone } from '../lib/phone.js';
import { REVIEW_SELECT, reviewDto, reviewSummary } from '../lib/reviews.js';
import { getFees } from '../lib/settings.js';
import { dir, sortParam } from '../lib/sort.js';
import { US_STATE_CODES } from '../lib/usStates.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireSeller, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser, requireSeller);

const actor = (req) => ({ actorType: 'user', actorId: req.user.id, ip: req.ip });
const page = { limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) };
const messageBody = z.object({ body: z.string({ error: 'Write a message' }).trim().min(1, 'Write a message').max(MESSAGE_MAX, 'That message is too long') });
const iso = (d) => (d ? new Date(d).toISOString() : null);

function idParam(value, what = 'Order') {
  if (!UUID_RE.test(value)) throw notFound(`${what} not found`);
  return value;
}

// ---- Sold orders -----------------------------------------------------------------------------

router.get('/orders', async (req, res) => {
  const f = parse(
    z.object({ status: z.enum(['all', 'placed', 'shipped', 'delivered', 'cancelled']).default('all'), q: z.string().trim().min(1).max(100).optional(), sort: sortParam(), ...page }),
    req.query,
  );
  const filters = { sellerId: req.user.id, status: f.status, q: f.q };
  const [counts] = await pool.query('SELECT status, COUNT(*) AS n FROM orders WHERE seller_id = ? GROUP BY status', [req.user.id]);
  const byStatus = { placed: 0, shipped: 0, delivered: 0, cancelled: 0 };
  for (const c of counts) byStatus[c.status] = Number(c.n);
  res.json({
    items: await loadOrders({ ...filters, sort: f.sort, limit: f.limit, offset: f.offset, view: 'seller' }),
    total: await countOrders(filters),
    counts: byStatus,
    limit: f.limit,
    offset: f.offset,
  });
});

router.get('/orders/:id', async (req, res) => {
  res.json(await loadOrderFor(idParam(req.params.id), { sellerId: req.user.id }, 'seller'));
});

router.post('/orders/:id/ship', async (req, res) => {
  const order = await loadOrderFor(idParam(req.params.id), { sellerId: req.user.id }, 'seller');
  const body = parse(shipBody, req.body);
  await shipOrder(order, body, actor(req));
  res.json(await loadOrderFor(order.id, { sellerId: req.user.id }, 'seller'));
});

router.get('/orders/:id/messages', async (req, res) => {
  const order = await loadOrderFor(idParam(req.params.id), { sellerId: req.user.id }, 'seller');
  res.json({ items: await listMessages('order', order.id, ['seller']) });
});

router.post('/orders/:id/messages', async (req, res) => {
  const order = await loadOrderFor(idParam(req.params.id), { sellerId: req.user.id }, 'seller');
  const { body } = parse(messageBody, req.body);
  if ((await countMessages('order', order.id)) >= 500) throw conflict('This conversation is full. Contact TSM support if you still need help.');
  const row = await addMessage({ kind: 'order', threadId: order.id, senderType: 'seller', senderId: req.user.id, senderName: req.seller.display_name, body });
  res.status(201).json(messageDto(row, ['seller']));
});

// ---- Reviews -------------------------------------------------------------------------------------

router.get('/reviews', async (req, res) => {
  const f = parse(
    z.object({
      productId: z.string().regex(UUID_RE).optional(),
      rating: z.coerce.number().int().min(1).max(5).optional(),
      answered: z.enum(['all', 'yes', 'no']).default('all'),
      sort: sortParam(),
      ...page,
    }),
    req.query,
  );
  const where = ['r.seller_id = ?'];
  const params = [req.user.id];
  if (f.productId) { where.push('r.product_id = ?'); params.push(f.productId); }
  if (f.rating) { where.push('r.rating = ?'); params.push(f.rating); }
  if (f.answered === 'yes') where.push('r.seller_response IS NOT NULL');
  if (f.answered === 'no') where.push('r.seller_response IS NULL');
  const whereSql = where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reviews r WHERE ${whereSql}`, params);
  const [rows] = await pool.query(`${REVIEW_SELECT} WHERE ${whereSql} ORDER BY r.created_at ${dir(f.sort)}, r.id ${dir(f.sort)} LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  const [byProduct] = await pool.query(
    `SELECT r.product_id, p.name, COUNT(*) AS review_count, ROUND(AVG(r.rating), 2) AS average, SUM(r.seller_response IS NULL) AS unanswered
       FROM reviews r JOIN products p ON p.id = r.product_id
      WHERE r.seller_id = ? GROUP BY r.product_id, p.name ORDER BY p.name`,
    [req.user.id],
  );
  res.json({
    summary: await reviewSummary({ sellerId: req.user.id }),
    products: byProduct.map((p) => ({ productId: p.product_id, productName: p.name, count: Number(p.review_count), average: Number(p.average), unanswered: Number(p.unanswered) })),
    items: rows.map(reviewDto),
    total: Number(total),
    limit: f.limit,
    offset: f.offset,
  });
});

router.post('/reviews/:id/respond', async (req, res) => {
  const id = idParam(req.params.id, 'Review');
  const { response } = parse(
    z.object({ response: z.string({ error: 'Write your reply' }).trim().min(2, 'Write your reply').max(1000, 'Keep your reply under 1000 characters') }),
    req.body,
  );
  const [[review]] = await pool.query('SELECT id, seller_response FROM reviews WHERE id = ? AND seller_id = ?', [id, req.user.id]);
  if (!review) throw notFound('Review not found');
  await pool.query('UPDATE reviews SET seller_response = ?, seller_responded_at = NOW(3) WHERE id = ?', [response, id]);
  await audit({ ...actor(req), action: review.seller_response ? 'review.response_edited' : 'review.responded', entityType: 'review', entityId: id });
  const [[row]] = await pool.query(`${REVIEW_SELECT} WHERE r.id = ?`, [id]);
  res.json(reviewDto(row));
});

// ---- Sales rates: per day, week or month -----------------------------------------------------------

const PERIOD_DEFAULT = { day: 14, week: 12, month: 12, year: 5 };
// The app and the seller portal offer 1 to 25 in a drop-down, for every period.
export const PERIOD_MAX_COUNT = 25;
const DAY_MS = 86_400_000;

/** The first moment (UTC) of each of the last `count` days / weeks (Monday start) / months / years, oldest first. */
export function bucketStarts(period, count, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const starts = [];
  if (period === 'day') {
    for (let i = count - 1; i >= 0; i--) starts.push(new Date(today - i * DAY_MS));
  } else if (period === 'week') {
    const sinceMonday = (new Date(today).getUTCDay() + 6) % 7;
    const monday = today - sinceMonday * DAY_MS;
    for (let i = count - 1; i >= 0; i--) starts.push(new Date(monday - i * 7 * DAY_MS));
  } else if (period === 'year') {
    for (let i = count - 1; i >= 0; i--) starts.push(new Date(Date.UTC(now.getUTCFullYear() - i, 0, 1)));
  } else {
    for (let i = count - 1; i >= 0; i--) starts.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
  }
  return starts;
}

export function bucketEnd(period, start) {
  if (period === 'day') return new Date(start.getTime() + DAY_MS);
  if (period === 'week') return new Date(start.getTime() + 7 * DAY_MS);
  if (period === 'year') return new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

// Fixed fragments (never user text): which day / week / month a timestamp column falls in.
const bucketSql = (period, col) => ({
  day: `DATE(${col})`,
  week: `DATE_SUB(DATE(${col}), INTERVAL WEEKDAY(${col}) DAY)`,
  month: `DATE_SUB(DATE(${col}), INTERVAL (DAYOFMONTH(${col}) - 1) DAY)`,
  year: `DATE_SUB(DATE(${col}), INTERVAL (DAYOFYEAR(${col}) - 1) DAY)`,
})[period];

router.get('/stats', async (req, res) => {
  const f = parse(z.object({ period: z.enum(['day', 'week', 'month', 'year']).default('day'), count: z.coerce.number().int().min(1).optional() }), req.query);
  const count = Math.min(f.count ?? PERIOD_DEFAULT[f.period], PERIOD_MAX_COUNT);
  const starts = bucketStarts(f.period, count);
  const rangeStart = starts[0];
  const rangeEnd = bucketEnd(f.period, starts[starts.length - 1]);

  const [sales] = await pool.query(
    `SELECT DATE_FORMAT(${bucketSql(f.period, 'created_at')}, '%Y-%m-%d') AS bucket,
            COUNT(DISTINCT order_ref) AS orders, COALESCE(SUM(quantity), 0) AS units,
            COALESCE(SUM(gross_cents), 0) AS gross, COALESCE(SUM(commission_cents), 0) AS commission,
            COALESCE(SUM(processing_fee_cents), 0) AS processing, COALESCE(SUM(net_cents), 0) AS net
       FROM seller_earnings
      WHERE seller_id = ? AND status <> 'reversed' AND created_at >= ? AND created_at < ?
      GROUP BY bucket`,
    [req.user.id, rangeStart, rangeEnd],
  );
  const [payouts] = await pool.query(
    `SELECT DATE_FORMAT(${bucketSql(f.period, 'paid_at')}, '%Y-%m-%d') AS bucket, COALESCE(SUM(amount_cents), 0) AS paid
       FROM payouts
      WHERE seller_id = ? AND status = 'paid' AND paid_at >= ? AND paid_at < ?
      GROUP BY bucket`,
    [req.user.id, rangeStart, rangeEnd],
  );
  const saleBy = new Map(sales.map((r) => [r.bucket, r]));
  const paidBy = new Map(payouts.map((r) => [r.bucket, Number(r.paid)]));

  const buckets = starts.map((start) => {
    const key = start.toISOString().slice(0, 10);
    const s = saleBy.get(key);
    return {
      start: key,
      orders: Number(s?.orders ?? 0),
      units: Number(s?.units ?? 0),
      grossCents: Number(s?.gross ?? 0),
      tsmFeeCents: Number(s?.commission ?? 0),
      processingFeeCents: Number(s?.processing ?? 0),
      netCents: Number(s?.net ?? 0),
      paidOutCents: paidBy.get(key) ?? 0,
    };
  });
  const sum = (key) => buckets.reduce((total, b) => total + b[key], 0);
  const totals = {
    orders: sum('orders'), units: sum('units'), grossCents: sum('grossCents'), tsmFeeCents: sum('tsmFeeCents'),
    processingFeeCents: sum('processingFeeCents'), netCents: sum('netCents'), paidOutCents: sum('paidOutCents'),
  };
  res.json({
    period: f.period,
    count,
    buckets,
    totals,
    // "Rate" = the average per day / week / month over the window shown.
    averages: { grossCents: Math.round(totals.grossCents / count), netCents: Math.round(totals.netCents / count), orders: Number((totals.orders / count).toFixed(2)) },
    fees: await getFees(),
  });
});

// ---- Payout method -------------------------------------------------------------------------------------

const holder = z.string({ error: 'Enter the name on the account' }).trim().min(2, 'Enter the name on the account').max(100, 'That name is too long');

/** US bank routing numbers carry a check digit: 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) must be a multiple of 10. */
export function routingNumberOk(value) {
  if (!/^\d{9}$/.test(value)) return false;
  const d = [...value].map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

const email = z.string().trim().toLowerCase().max(255).email('Enter a valid email address');
const payoutMethodBody = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bank_transfer'),
    accountHolder: holder,
    routingNumber: z.string({ error: 'Enter the routing number' }).trim().refine(routingNumberOk, 'That routing number is not valid (it has 9 digits)'),
    accountNumber: z.string({ error: 'Enter the account number' }).trim().regex(/^\d{4,17}$/, 'The account number is 4 to 17 digits'),
  }),
  z.object({ type: z.literal('paypal'), accountHolder: holder, email }),
  z.object({ type: z.literal('zelle'), accountHolder: holder, contact: z.string({ error: 'Enter the email or phone number' }).trim().min(5, 'Enter the email or phone number').max(255) }),
  z.object({
    type: z.literal('check'),
    accountHolder: holder,
    line1: z.string({ error: 'Enter the street address' }).trim().min(3, 'Enter the street address').max(120),
    line2: z.string().trim().max(120).nullish().transform((v) => v || null),
    city: z.string({ error: 'Enter the city' }).trim().min(2, 'Enter the city').max(80),
    region: z.string({ error: 'Choose the state' }).trim().toUpperCase().refine((v) => US_STATE_CODES.has(v), 'Choose the state using its 2-letter code, like OH'),
    postalCode: z.string({ error: 'Enter the ZIP code' }).trim().regex(/^\d{5}(-\d{4})?$/, 'Enter a 5-digit ZIP code'),
  }),
]);

const maskEmail = (value) => {
  const [name, domain] = value.split('@');
  return `${name[0]}${'*'.repeat(Math.max(2, Math.min(name.length - 1, 5)))}@${domain}`;
};

/** The safe text shown in lists, and the private details that get encrypted. */
export function describePayoutMethod(body) {
  switch (body.type) {
    case 'bank_transfer':
      return { label: `Bank account ending ${body.accountNumber.slice(-4)}`, details: { routingNumber: body.routingNumber, accountNumber: body.accountNumber } };
    case 'paypal':
      return { label: `PayPal ${maskEmail(body.email)}`, details: { email: body.email } };
    case 'zelle': {
      const fail = (message) => new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'contact', message }]);
      if (body.contact.includes('@')) {
        const parsed = email.safeParse(body.contact);
        if (!parsed.success) throw fail('Enter a valid email address');
        return { label: `Zelle ${maskEmail(parsed.data)}`, details: { contact: parsed.data } };
      }
      const phone = formatPhone(body.contact);
      if (!phone) throw fail('Enter a 10-digit US phone number, like (555) 123-4567');
      return { label: `Zelle phone ending ${phone.slice(-4)}`, details: { contact: phone } };
    }
    default:
      return {
        label: `Paper check to ${body.city}, ${body.region}`,
        details: { line1: body.line1, line2: body.line2, city: body.city, region: body.region, postalCode: body.postalCode },
      };
  }
}

export function payoutMethodDto(row) {
  return row ? { type: row.method_type, accountHolder: row.account_holder, label: row.display_label, updatedAt: iso(row.updated_at) } : null;
}

router.get('/payout-method', async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM seller_payout_methods WHERE seller_id = ?', [req.user.id]);
  res.json({ method: payoutMethodDto(row) });
});

router.put('/payout-method', async (req, res) => {
  const body = parse(payoutMethodBody, req.body);
  const described = describePayoutMethod(body);
  await pool.query(
    `INSERT INTO seller_payout_methods (seller_id, method_type, account_holder, display_label, details_enc)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE method_type = VALUES(method_type), account_holder = VALUES(account_holder),
                             display_label = VALUES(display_label), details_enc = VALUES(details_enc)`,
    [req.user.id, body.type, body.accountHolder, described.label, encryptJson(described.details, req.user.id)],
  );
  // The log records that it changed and the masked label, never the account details.
  await audit({ ...actor(req), action: 'seller.payout_method_saved', entityType: 'seller', entityId: req.user.id, details: { type: body.type, label: described.label } });
  const [[row]] = await pool.query('SELECT * FROM seller_payout_methods WHERE seller_id = ?', [req.user.id]);
  res.json({ method: payoutMethodDto(row) });
});

router.delete('/payout-method', async (req, res) => {
  await pool.query('DELETE FROM seller_payout_methods WHERE seller_id = ?', [req.user.id]);
  await audit({ ...actor(req), action: 'seller.payout_method_removed', entityType: 'seller', entityId: req.user.id });
  res.status(204).end();
});

export default router;
