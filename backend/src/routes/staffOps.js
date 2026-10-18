// Staff: platform settings (the fees), sellers' payout details, and the orders that were placed.
//
//   GET /api/staff/settings                      the fee rates TSM and the seller pay on each sale, and who last changed them
//   PUT /api/staff/settings/fees                 {tsmFeeBps?, processingFeeBps?}  (500 = 5.00%). No fixed ceiling; together at most 100%.
//                                                Applies to sales made from now on - a sale keeps the rates it was made at.
//   GET /api/staff/sellers/:id/payout-method     where to send this seller's money. Shows the real details; every view is logged.
//   GET /api/staff/orders                        ?status, sellerId, q, sort=newest|oldest, limit, offset
//   GET /api/staff/orders/:id                    one order
//   GET /api/staff/orders/:id/messages           the buyer-seller chat for that order (every view is logged)
//
// Reading is open to every staff role; changing fees and seeing payout details needs "admin" or "super_admin".
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { listMessages } from '../lib/conversations.js';
import { decryptJson } from '../lib/crypto.js';
import { countOrders, loadOrderFor, loadOrders } from '../lib/orders.js';
import { MAX_TOTAL_FEE_BPS, getFeeSettings, getFees, saveFees } from '../lib/settings.js';
import { sortParam } from '../lib/sort.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();
const read = requireStaff();
const write = requireStaff('super_admin', 'admin');
const actor = (req) => ({ actorType: 'staff', actorId: req.staff.id, ip: req.ip });
const page = { limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) };
const iso = (d) => (d ? new Date(d).toISOString() : null);

function idParam(req, what) {
  if (!UUID_RE.test(req.params.id)) throw notFound(`${what} not found`);
  return req.params.id;
}

// ---- Settings ------------------------------------------------------------------------------------------

router.get('/settings', read, async (req, res) => {
  res.json({ fees: await getFeeSettings() });
});

router.put('/settings/fees', write, async (req, res) => {
  const body = parse(
    z
      .object({
        tsmFeeBps: z.number().int('Use a whole number of basis points').min(0, 'Cannot be negative').optional(),
        processingFeeBps: z.number().int('Use a whole number of basis points').min(0, 'Cannot be negative').optional(),
      })
      .refine((v) => v.tsmFeeBps !== undefined || v.processingFeeBps !== undefined, { message: 'Nothing to change' }),
    req.body,
  );
  const before = await getFees();
  // No fixed ceiling on either rate, but together they can never take more than the whole sale.
  const next = { tsmFeeBps: body.tsmFeeBps ?? before.tsmFeeBps, processingFeeBps: body.processingFeeBps ?? before.processingFeeBps };
  if (next.tsmFeeBps + next.processingFeeBps > MAX_TOTAL_FEE_BPS) {
    throw new HttpError(400, 'validation_error', 'Some fields are invalid', [
      { field: body.tsmFeeBps !== undefined ? 'tsmFeeBps' : 'processingFeeBps', message: 'TSM’s fee and the payment fee together cannot be more than 100% of a sale' },
    ]);
  }
  await saveFees(body, req.staff.id);
  const after = await getFees();
  await audit({ ...actor(req), action: 'settings.fees_updated', entityType: 'settings', details: { before: { tsmFeeBps: before.tsmFeeBps, processingFeeBps: before.processingFeeBps }, after: { tsmFeeBps: after.tsmFeeBps, processingFeeBps: after.processingFeeBps } } });
  res.json({ fees: await getFeeSettings() });
});

// ---- A seller's payout details ---------------------------------------------------------------------------

router.get('/sellers/:id/payout-method', write, async (req, res) => {
  const id = idParam(req, 'Seller');
  const [[seller]] = await pool.query('SELECT user_id, display_name FROM seller_profiles WHERE user_id = ?', [id]);
  if (!seller) throw notFound('Seller not found');
  const [[row]] = await pool.query('SELECT * FROM seller_payout_methods WHERE seller_id = ?', [id]);
  if (!row) return res.json({ method: null });
  let details;
  try {
    details = decryptJson(row.details_enc, id);
  } catch {
    throw new HttpError(500, 'payout_details_unreadable', 'The saved payout details could not be decrypted. Ask the seller to enter them again (was DATA_ENCRYPTION_KEY or JWT_SECRET_USER changed?).');
  }
  await audit({ ...actor(req), action: 'seller.payout_method_viewed', entityType: 'seller', entityId: id, details: { displayName: seller.display_name, type: row.method_type } });
  res.json({ method: { type: row.method_type, accountHolder: row.account_holder, label: row.display_label, updatedAt: iso(row.updated_at), details } });
});

// ---- Orders (read only) -------------------------------------------------------------------------------------

router.get('/orders', read, async (req, res) => {
  const f = parse(
    z.object({
      status: z.enum(['all', 'placed', 'shipped', 'delivered', 'cancelled']).default('all'),
      sellerId: z.string().regex(UUID_RE).optional(),
      q: z.string().trim().min(1).max(100).optional(),
      sort: sortParam(),
      ...page,
    }),
    req.query,
  );
  const filters = { status: f.status, sellerId: f.sellerId, q: f.q };
  res.json({
    items: await loadOrders({ ...filters, sort: f.sort, limit: f.limit, offset: f.offset, view: 'staff' }),
    total: await countOrders(filters),
    limit: f.limit,
    offset: f.offset,
  });
});

router.get('/orders/:id', read, async (req, res) => {
  res.json(await loadOrderFor(idParam(req, 'Order'), {}, 'staff'));
});

router.get('/orders/:id/messages', read, async (req, res) => {
  const order = await loadOrderFor(idParam(req, 'Order'), {}, 'staff');
  await audit({ ...actor(req), action: 'staff.order_messages_viewed', entityType: 'order', entityId: order.id, details: { orderNumber: order.orderNumber } });
  res.json({ items: await listMessages('order', order.id, []) });
});

export default router;
