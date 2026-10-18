// Staff: watch and manage the people and offers on the platform.
//
//   GET  /api/staff/sellers                    ?q, status=all|active|suspended, limit, offset
//   GET  /api/staff/sellers/:id                profile, owner details, application, offers, earnings
//   POST /api/staff/sellers/:id/suspend        {reason}   (their offers leave the shop at once)
//   POST /api/staff/sellers/:id/revoke         {reason}   removes SELLING only: the person's account, shopping and orders keep working
//   POST /api/staff/sellers/:id/reinstate      lifts a suspension, or restores selling after a revoke
//   GET  /api/staff/users                      ?q, status=all|active|suspended|deleted, limit, offset
//   GET  /api/staff/users/:id                  account, address (this view is written to the audit log)
//   POST /api/staff/users/:id/suspend          {reason}
//   POST /api/staff/users/:id/reinstate
//   GET  /api/staff/listings                   ?q, sellerId, productId, status=all|live|paused|on_hold|sold_out|seller_suspended|seller_revoked
//   POST /api/staff/listings/:id/hold          {reason}   (takes an offer off the shop; the seller cannot undo it)
//   POST /api/staff/listings/:id/release
//
// Reading is open to every staff role; changing things needs "admin" or "super_admin".
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { earningTotals } from '../lib/earnings.js';
import { LISTING_SELECT, fullListingDto as staffListingDto } from '../lib/listings.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();
const read = requireStaff();
const write = requireStaff('super_admin', 'admin');

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const actor = (req) => ({ actorType: 'staff', actorId: req.staff.id, ip: req.ip });
function idParam(req) {
  if (!UUID_RE.test(req.params.id)) throw notFound();
  return req.params.id;
}
const reasonBody = z.object({
  reason: z.string({ error: 'Give a reason' }).trim().min(3, 'Give a short reason (at least 3 characters)').max(255, 'Keep the reason under 255 characters'),
});
const page = { limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) };

// ---- Sellers -----------------------------------------------------------------------

const LIVE_SQL = "l.is_active = 1 AND l.admin_hold = 0 AND sp.status = 'active' AND l.quantity_available > 0";

function sellerRowDto(r) {
  return {
    id: r.user_id,
    displayName: r.display_name,
    username: r.username,
    email: r.email,
    status: r.status,
    ratingAvg: Number(r.rating_avg),
    ratingCount: r.rating_count,
    salesCount: r.sales_count,
    approvedAt: iso(r.approved_at),
    suspendedAt: iso(r.suspended_at),
    suspendedReason: r.suspended_reason ?? null,
    revokedAt: iso(r.revoked_at),
    revokedReason: r.revoked_reason ?? null,
    listingCount: Number(r.listing_count ?? 0),
    liveListingCount: Number(r.live_listing_count ?? 0),
    availableCents: Number(r.available_cents ?? 0),
  };
}

const SELLER_SELECT = `
  SELECT sp.*, u.username, u.email,
         (SELECT COUNT(*) FROM listings l WHERE l.seller_id = sp.user_id) AS listing_count,
         (SELECT COUNT(*) FROM listings l WHERE l.seller_id = sp.user_id AND ${LIVE_SQL}) AS live_listing_count,
         (SELECT COALESCE(SUM(e.net_cents), 0) FROM seller_earnings e WHERE e.seller_id = sp.user_id AND e.status = 'available') AS available_cents
    FROM seller_profiles sp
    JOIN users u ON u.id = sp.user_id`;

router.get('/sellers', read, async (req, res) => {
  const f = parse(z.object({ q: z.string().trim().min(1).max(100).optional(), status: z.enum(['all', 'active', 'suspended', 'revoked']).default('all'), ...page }), req.query);
  const where = [];
  const params = [];
  if (f.q) {
    where.push('(sp.display_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)');
    const like = `%${escapeLike(f.q)}%`;
    params.push(like, like, like);
  }
  if (f.status !== 'all') { where.push('sp.status = ?'); params.push(f.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM seller_profiles sp JOIN users u ON u.id = sp.user_id ${whereSql}`, params);
  const [rows] = await pool.query(`${SELLER_SELECT} ${whereSql} ORDER BY sp.display_name LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  res.json({ items: rows.map(sellerRowDto), total: Number(total), limit: f.limit, offset: f.offset });
});

router.get('/sellers/:id', read, async (req, res) => {
  const id = idParam(req);
  const [[row]] = await pool.query(`${SELLER_SELECT} WHERE sp.user_id = ?`, [id]);
  if (!row) throw notFound('Seller not found');
  const [[user]] = await pool.query('SELECT phone, created_at, last_login_at FROM users WHERE id = ?', [id]);
  const [[application]] = await pool.query(
    `SELECT id, business_name, business_address, contact_email, phone_number, source_type, distributor_list, status, submitted_at, reviewed_at
       FROM seller_applications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1`, [id]);
  const [listings] = await pool.query(`${LISTING_SELECT} WHERE l.seller_id = ? ORDER BY b.name, p.name, l.created_at`, [id]);
  const totals = await earningTotals(id);
  const [[payout]] = await pool.query('SELECT method_type, account_holder, display_label, updated_at FROM seller_payout_methods WHERE seller_id = ?', [id]);
  const [activity] = await pool.query(
    `SELECT id, action, entity_type, entity_id, details, created_at FROM audit_logs
      WHERE (actor_type = 'user' AND actor_id = ?) OR (entity_type = 'seller' AND entity_id = ?)
      ORDER BY id DESC LIMIT 15`, [id, id]);
  res.json({
    ...sellerRowDto(row),
    phone: user?.phone ?? null,
    memberSince: iso(user?.created_at),
    lastLoginAt: iso(user?.last_login_at),
    application: application && {
      id: application.id,
      businessName: application.business_name,
      businessAddress: application.business_address,
      contactEmail: application.contact_email,
      phoneNumber: application.phone_number ?? null,
      sourceType: application.source_type,
      distributorList: application.distributor_list,
      status: application.status,
      submittedAt: iso(application.submitted_at),
      reviewedAt: iso(application.reviewed_at),
    },
    earnings: totals,
    payoutMethod: payout
      ? { type: payout.method_type, accountHolder: payout.account_holder, label: payout.display_label, updatedAt: iso(payout.updated_at) }
      : null,
    listings: listings.map(staffListingDto),
    activity: activity.map((a) => ({
      id: Number(a.id), action: a.action, entityType: a.entity_type, entityId: a.entity_id,
      details: typeof a.details === 'string' ? JSON.parse(a.details) : a.details, createdAt: iso(a.created_at),
    })),
  });
});

router.post('/sellers/:id/suspend', write, async (req, res) => {
  const id = idParam(req);
  const { reason } = parse(reasonBody, req.body);
  const [[seller]] = await pool.query('SELECT user_id, display_name, status FROM seller_profiles WHERE user_id = ?', [id]);
  if (!seller) throw notFound('Seller not found');
  if (seller.status === 'suspended') throw conflict('This seller is already suspended');
  await pool.query("UPDATE seller_profiles SET status = 'suspended', suspended_at = NOW(3), suspended_reason = ? WHERE user_id = ?", [reason, id]);
  await audit({ ...actor(req), action: 'seller.suspended', entityType: 'seller', entityId: id, details: { displayName: seller.display_name, reason } });
  const [[row]] = await pool.query(`${SELLER_SELECT} WHERE sp.user_id = ?`, [id]);
  res.json(sellerRowDto(row));
});

// Revoking removes the right to SELL and nothing else. The person's login, shopping, orders and
// messages are untouched (to lock the whole account, use "Suspend account" on the Users page).
router.post('/sellers/:id/revoke', write, async (req, res) => {
  const id = idParam(req);
  const { reason } = parse(reasonBody, req.body);
  const [[seller]] = await pool.query('SELECT user_id, display_name, status FROM seller_profiles WHERE user_id = ?', [id]);
  if (!seller) throw notFound('Seller not found');
  if (seller.status === 'revoked') throw conflict('Selling is already revoked for this person');
  await pool.query("UPDATE seller_profiles SET status = 'revoked', revoked_at = NOW(3), revoked_reason = ? WHERE user_id = ?", [reason, id]);
  await audit({ ...actor(req), action: 'seller.selling_revoked', entityType: 'seller', entityId: id, details: { displayName: seller.display_name, reason, previousStatus: seller.status } });
  const [[row]] = await pool.query(`${SELLER_SELECT} WHERE sp.user_id = ?`, [id]);
  res.json(sellerRowDto(row));
});

router.post('/sellers/:id/reinstate', write, async (req, res) => {
  const id = idParam(req);
  const [[seller]] = await pool.query('SELECT user_id, display_name, status FROM seller_profiles WHERE user_id = ?', [id]);
  if (!seller) throw notFound('Seller not found');
  if (seller.status === 'active') throw conflict('This seller is not suspended or revoked');
  await pool.query(
    "UPDATE seller_profiles SET status = 'active', suspended_at = NULL, suspended_reason = NULL, revoked_at = NULL, revoked_reason = NULL WHERE user_id = ?",
    [id],
  );
  await audit({
    ...actor(req),
    action: seller.status === 'revoked' ? 'seller.selling_restored' : 'seller.reinstated',
    entityType: 'seller', entityId: id, details: { displayName: seller.display_name },
  });
  const [[row]] = await pool.query(`${SELLER_SELECT} WHERE sp.user_id = ?`, [id]);
  res.json(sellerRowDto(row));
});

// ---- Users -------------------------------------------------------------------------

function userRowDto(r) {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    phone: r.phone ?? null,
    status: r.status,
    isSeller: Boolean(r.is_seller),
    emailVerified: Boolean(r.email_verified_at),
    createdAt: iso(r.created_at),
    lastLoginAt: iso(r.last_login_at),
  };
}

router.get('/users', read, async (req, res) => {
  const f = parse(z.object({ q: z.string().trim().min(1).max(100).optional(), status: z.enum(['all', 'active', 'suspended', 'deleted']).default('all'), ...page }), req.query);
  const where = [];
  const params = [];
  if (f.q) {
    where.push('(u.username LIKE ? OR u.email LIKE ?)');
    const like = `%${escapeLike(f.q)}%`;
    params.push(like, like);
  }
  if (f.status !== 'all') { where.push('u.status = ?'); params.push(f.status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT u.*, EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.user_id = u.id) AS is_seller
       FROM users u ${whereSql} ORDER BY u.created_at DESC, u.username LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset]);
  res.json({ items: rows.map(userRowDto), total: Number(total), limit: f.limit, offset: f.offset });
});

router.get('/users/:id', read, async (req, res) => {
  const id = idParam(req);
  const [[row]] = await pool.query(
    `SELECT u.*, EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.user_id = u.id) AS is_seller FROM users u WHERE u.id = ?`, [id]);
  if (!row) throw notFound('User not found');
  const [[address]] = await pool.query('SELECT * FROM user_addresses WHERE user_id = ?', [id]);
  const [applications] = await pool.query(
    'SELECT id, business_name, status, submitted_at FROM seller_applications WHERE user_id = ? ORDER BY submitted_at DESC', [id]);
  const [activity] = await pool.query(
    `SELECT id, action, entity_type, created_at FROM audit_logs WHERE actor_type = 'user' AND actor_id = ? ORDER BY id DESC LIMIT 15`, [id]);
  // Looking at a person's details is itself recorded.
  await audit({ ...actor(req), action: 'staff.user_viewed', entityType: 'user', entityId: id });
  res.json({
    ...userRowDto(row),
    address: address && {
      fullName: address.full_name, line1: address.line1, line2: address.line2 ?? null, city: address.city,
      region: address.region, postalCode: address.postal_code, country: address.country,
    },
    sellerApplications: applications.map((a) => ({ id: a.id, businessName: a.business_name, status: a.status, submittedAt: iso(a.submitted_at) })),
    activity: activity.map((a) => ({ id: Number(a.id), action: a.action, entityType: a.entity_type, createdAt: iso(a.created_at) })),
  });
});

router.post('/users/:id/suspend', write, async (req, res) => {
  const id = idParam(req);
  const { reason } = parse(reasonBody, req.body);
  const [[user]] = await pool.query('SELECT id, username, status FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('User not found');
  if (user.status === 'deleted') throw conflict('This account was deleted by its owner');
  if (user.status === 'suspended') throw conflict('This account is already suspended');
  await pool.query("UPDATE users SET status = 'suspended' WHERE id = ?", [id]);
  await audit({ ...actor(req), action: 'user.suspended', entityType: 'user', entityId: id, details: { username: user.username, reason } });
  res.json({ id, status: 'suspended' });
});

router.post('/users/:id/reinstate', write, async (req, res) => {
  const id = idParam(req);
  const [[user]] = await pool.query('SELECT id, username, status FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('User not found');
  if (user.status !== 'suspended') throw conflict('This account is not suspended');
  await pool.query("UPDATE users SET status = 'active' WHERE id = ?", [id]);
  await audit({ ...actor(req), action: 'user.reinstated', entityType: 'user', entityId: id, details: { username: user.username } });
  res.json({ id, status: 'active' });
});

// ---- Offers (listings) across all sellers -------------------------------------------

const STATUS_SQL = {
  live: LIVE_SQL,
  paused: 'l.admin_hold = 0 AND l.is_active = 0',
  on_hold: 'l.admin_hold = 1',
  seller_suspended: "l.admin_hold = 0 AND l.is_active = 1 AND sp.status = 'suspended'",
  seller_revoked: "l.admin_hold = 0 AND l.is_active = 1 AND sp.status = 'revoked'",
  sold_out: "l.admin_hold = 0 AND l.is_active = 1 AND sp.status = 'active' AND l.quantity_available = 0",
};

router.get('/listings', read, async (req, res) => {
  const f = parse(
    z.object({
      q: z.string().trim().min(1).max(100).optional(),
      sellerId: z.string().regex(UUID_RE).optional(),
      productId: z.string().regex(UUID_RE).optional(),
      status: z.enum(['all', ...Object.keys(STATUS_SQL)]).default('all'),
      ...page,
    }),
    req.query,
  );
  const where = [];
  const params = [];
  if (f.q) {
    where.push('(p.name LIKE ? OR b.name LIKE ? OR sp.display_name LIKE ? OR l.distributor LIKE ?)');
    const like = `%${escapeLike(f.q)}%`;
    params.push(like, like, like, like);
  }
  if (f.sellerId) { where.push('l.seller_id = ?'); params.push(f.sellerId); }
  if (f.productId) { where.push('l.product_id = ?'); params.push(f.productId); }
  if (f.status !== 'all') where.push(`(${STATUS_SQL[f.status]})`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM listings l JOIN seller_profiles sp ON sp.user_id = l.seller_id
       JOIN products p ON p.id = l.product_id JOIN brands b ON b.id = p.brand_id ${whereSql}`, params);
  const [rows] = await pool.query(`${LISTING_SELECT} ${whereSql} ORDER BY b.name, p.name, l.price LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  res.json({ items: rows.map(staffListingDto), total: Number(total), limit: f.limit, offset: f.offset });
});

async function loadStaffListing(id) {
  const [[row]] = await pool.query(`${LISTING_SELECT} WHERE l.id = ?`, [id]);
  if (!row) throw notFound('Offer not found');
  return row;
}

router.post('/listings/:id/hold', write, async (req, res) => {
  const id = idParam(req);
  const { reason } = parse(reasonBody, req.body);
  const row = await loadStaffListing(id);
  if (row.admin_hold) throw conflict('This offer is already on hold');
  await pool.query('UPDATE listings SET admin_hold = 1, admin_hold_reason = ? WHERE id = ?', [reason, id]);
  await audit({ ...actor(req), action: 'listing.held', entityType: 'listing', entityId: id, details: { product: row.product_name, seller: row.display_name, reason } });
  res.json(staffListingDto(await loadStaffListing(id)));
});

router.post('/listings/:id/release', write, async (req, res) => {
  const id = idParam(req);
  const row = await loadStaffListing(id);
  if (!row.admin_hold) throw conflict('This offer is not on hold');
  await pool.query('UPDATE listings SET admin_hold = 0, admin_hold_reason = NULL WHERE id = ?', [id]);
  await audit({ ...actor(req), action: 'listing.released', entityType: 'listing', entityId: id, details: { product: row.product_name, seller: row.display_name } });
  res.json(staffListingDto(await loadStaffListing(id)));
});

export default router;
