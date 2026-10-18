// The seller portal API: approved sellers manage their own offers and look at their money.
//
//   GET   /api/seller/me                 profile, the distributors they named in their application, TSM's commission
//   GET   /api/seller/dashboard          offer counts, stock, balances, latest sales
//   GET   /api/seller/catalog            ?q, brandId, typeId, limit, offset  the products TSM staff made (ready ones only)
//   GET   /api/seller/listings           ?status=all|live|paused|on_hold|sold_out, limit, offset
//   GET   /api/seller/listings/:id       one of my offers
//   POST  /api/seller/listings           {productId, priceCents, quantityAvailable, sourceType, distributor,
//                                         packaging: "case"|"loose", boxNumber?, boxesInCase?}
//   PATCH /api/seller/listings/:id       any of the fields above (not productId) and isActive (pause / resume)
//   GET   /api/seller/earnings           ?status, limit, offset  sales ledger + balances
//   GET   /api/seller/payouts            payouts TSM has made or queued
//
// Only a signed-in person whose seller application was approved (and who is not suspended) gets in.
// Sellers can only offer products that staff created and finished (description + main photo),
// and can only touch their own offers.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { earningDto, earningTotals, payoutDto } from '../lib/earnings.js';
import {
  LISTING_SELECT,
  createListingBody,
  fullListingDto,
  listingBase,
  listingColumns,
  listingFields,
  patchListingBody,
} from '../lib/listings.js';
import { PRODUCT_READY_SQL, mediaPath } from '../lib/media.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireSeller, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser, requireSeller);

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const actor = (req) => ({ actorType: 'user', actorId: req.user.id, ip: req.ip });
const page = { limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) };
const fieldError = (field, message) => new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field, message }]);

// ---- Who am I ----------------------------------------------------------------------

router.get('/me', async (req, res) => {
  const s = req.seller;
  const [[application]] = await pool.query(
    "SELECT distributor_list FROM seller_applications WHERE user_id = ? AND status = 'approved' ORDER BY reviewed_at DESC, submitted_at DESC LIMIT 1",
    [req.user.id],
  );
  const distributors = [
    ...new Set(
      (application?.distributor_list ?? '')
        .split(/[,\n]/)
        .map((d) => d.trim())
        .filter(Boolean),
    ),
  ];
  res.json({
    id: s.user_id,
    displayName: s.display_name,
    status: s.status,
    username: req.user.username,
    email: req.user.email,
    ratingAvg: Number(s.rating_avg),
    ratingCount: s.rating_count,
    salesCount: s.sales_count,
    approvedAt: iso(s.approved_at),
    distributors,
    commissionBps: config.commissionBps,
  });
});

router.get('/dashboard', async (req, res) => {
  const id = req.user.id;
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(l.is_active = 1 AND l.admin_hold = 0 AND l.quantity_available > 0), 0) AS live,
            COALESCE(SUM(l.admin_hold = 0 AND l.is_active = 0), 0) AS paused,
            COALESCE(SUM(l.admin_hold = 1), 0) AS onHold,
            COALESCE(SUM(l.admin_hold = 0 AND l.is_active = 1 AND l.quantity_available = 0), 0) AS soldOut,
            COALESCE(SUM(CASE WHEN l.is_active = 1 AND l.admin_hold = 0 THEN l.quantity_available END), 0) AS unitsInStock,
            COALESCE(SUM(CASE WHEN l.is_active = 1 AND l.admin_hold = 0 THEN l.quantity_available * l.price END), 0) AS inventoryValue
       FROM listings l WHERE l.seller_id = ?`,
    [id],
  );
  const money = await earningTotals(id);
  const [recent] = await pool.query('SELECT * FROM seller_earnings WHERE seller_id = ? ORDER BY created_at DESC, id LIMIT 5', [id]);
  res.json({
    listings: {
      total: Number(stats.total),
      live: Number(stats.live),
      paused: Number(stats.paused),
      onHold: Number(stats.onHold),
      soldOut: Number(stats.soldOut),
      unitsInStock: Number(stats.unitsInStock),
      inventoryValueCents: Math.round(Number(stats.inventoryValue) * 100),
    },
    money,
    recentSales: recent.map(earningDto),
  });
});

// ---- The catalog sellers pick from -------------------------------------------------

router.get('/catalog', async (req, res) => {
  const f = parse(
    z.object({
      q: z.string().trim().min(1).max(100).optional(),
      brandId: z.string().regex(UUID_RE).optional(),
      typeId: z.string().regex(UUID_RE).optional(),
      ...page,
    }),
    req.query,
  );
  const where = [PRODUCT_READY_SQL];
  const params = [];
  if (f.q) {
    where.push('(p.name LIKE ? OR b.name LIKE ?)');
    params.push(`%${escapeLike(f.q)}%`, `%${escapeLike(f.q)}%`);
  }
  if (f.brandId) { where.push('p.brand_id = ?'); params.push(f.brandId); }
  if (f.typeId) { where.push('p.product_type_id = ?'); params.push(f.typeId); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const from = 'FROM products p JOIN brands b ON b.id = p.brand_id JOIN product_types pt ON pt.id = p.product_type_id';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.description, p.thumbnail_key, b.id AS brand_id, b.name AS brand_name, pt.id AS type_id, pt.name AS type_name,
            (SELECT COUNT(*) FROM listings l WHERE l.product_id = p.id AND l.seller_id = ?) AS my_listing_count
       ${from} ${whereSql} ORDER BY b.name, p.name LIMIT ? OFFSET ?`,
    [req.user.id, ...params, f.limit, f.offset],
  );
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      brand: { id: r.brand_id, name: r.brand_name },
      type: { id: r.type_id, name: r.type_name },
      thumbnailUrl: mediaPath(r.thumbnail_key),
      myListingCount: Number(r.my_listing_count),
    })),
    total: Number(total),
    limit: f.limit,
    offset: f.offset,
  });
});

// ---- My offers ---------------------------------------------------------------------

const STATUS_SQL = {
  live: "l.is_active = 1 AND l.admin_hold = 0 AND l.quantity_available > 0",
  paused: 'l.admin_hold = 0 AND l.is_active = 0',
  on_hold: 'l.admin_hold = 1',
  sold_out: 'l.admin_hold = 0 AND l.is_active = 1 AND l.quantity_available = 0',
};

router.get('/listings', async (req, res) => {
  const f = parse(z.object({ status: z.enum(['all', ...Object.keys(STATUS_SQL)]).default('all'), ...page }), req.query);
  const where = ['l.seller_id = ?'];
  const params = [req.user.id];
  if (f.status !== 'all') where.push(`(${STATUS_SQL[f.status]})`);
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM listings l ${whereSql}`, params);
  const [rows] = await pool.query(`${LISTING_SELECT} ${whereSql} ORDER BY b.name, p.name, l.created_at LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  res.json({ items: rows.map(fullListingDto), total: Number(total), limit: f.limit, offset: f.offset });
});

async function loadMine(id, userId) {
  if (!UUID_RE.test(id)) throw notFound('Offer not found');
  const [[row]] = await pool.query(`${LISTING_SELECT} WHERE l.id = ? AND l.seller_id = ?`, [id, userId]);
  if (!row) throw notFound('Offer not found');
  return row;
}

router.get('/listings/:id', async (req, res) => {
  res.json(fullListingDto(await loadMine(req.params.id, req.user.id)));
});

router.post('/listings', async (req, res) => {
  const body = parse(createListingBody, req.body);
  // Only products staff created AND finished (description + main photo) can be offered.
  const [[product]] = await pool.query(`SELECT p.id, p.name FROM products p WHERE p.id = ? AND ${PRODUCT_READY_SQL}`, [body.productId]);
  if (!product) throw fieldError('productId', 'That product is not available to sell. Pick one from the TSM catalog.');

  const cols = listingColumns(body);
  const id = randomUUID();
  await pool.query(
    `INSERT INTO listings (id, product_id, seller_id, price, source, box_position, box_number, boxes_in_case,
                           source_type, distributor, quantity_available, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, body.productId, req.user.id, cols.price, cols.source, cols.box_position, cols.box_number, cols.boxes_in_case,
     cols.source_type, cols.distributor, cols.quantity_available],
  );
  await audit({
    ...actor(req), action: 'listing.created', entityType: 'listing', entityId: id,
    details: {
      product: product.name, priceCents: body.priceCents, quantity: body.quantityAvailable,
      sourceType: body.sourceType, distributor: body.distributor, boxPosition: cols.box_position,
    },
  });
  res.status(201).json(fullListingDto(await loadMine(id, req.user.id)));
});

router.patch('/listings/:id', async (req, res) => {
  const row = await loadMine(req.params.id, req.user.id);
  const patch = parse(patchListingBody, req.body);
  const before = fullListingDto(row);

  // Merge the change into what is stored, then check the whole offer again.
  const merged = {
    priceCents: patch.priceCents ?? before.priceCents,
    quantityAvailable: patch.quantityAvailable ?? before.quantityAvailable,
    sourceType: patch.sourceType ?? before.sourceType,
    distributor: patch.distributor ?? before.distributor ?? '',
    packaging: patch.packaging ?? before.packaging,
    boxNumber: patch.packaging === 'loose' ? null : (patch.boxNumber ?? before.boxNumber),
    boxesInCase: patch.packaging === 'loose' ? null : (patch.boxesInCase ?? before.boxesInCase),
  };
  const touchesCase = ['packaging', 'boxNumber', 'boxesInCase'].some((k) => k in patch);
  // Older demo offers say "From Case" without a box number; a price or stock change must not be blocked by that.
  const legacyCase = before.packaging === 'case' && before.boxNumber == null && !touchesCase;
  const checked = (legacyCase ? listingBase : listingFields).parse(merged);

  let isActive = row.is_active;
  if (patch.isActive !== undefined) {
    if (patch.isActive && row.admin_hold) {
      throw new HttpError(403, 'forbidden', `TSM put this offer on hold: ${row.admin_hold_reason ?? 'contact support'}`);
    }
    isActive = patch.isActive ? 1 : 0;
  }
  const cols = listingColumns(checked);
  await pool.query(
    `UPDATE listings SET price = ?, quantity_available = ?, source_type = ?, distributor = ?, source = ?,
            box_position = ?, box_number = ?, boxes_in_case = ?, is_active = ? WHERE id = ?`,
    [cols.price, cols.quantity_available, cols.source_type, cols.distributor,
     legacyCase ? row.source : cols.source,
     legacyCase ? row.box_position : cols.box_position,
     legacyCase ? row.box_number : cols.box_number,
     legacyCase ? row.boxes_in_case : cols.boxes_in_case,
     isActive, row.id],
  );
  const changes = {};
  if (checked.priceCents !== before.priceCents) changes.priceCents = [before.priceCents, checked.priceCents];
  if (checked.quantityAvailable !== before.quantityAvailable) changes.quantity = [before.quantityAvailable, checked.quantityAvailable];
  if (checked.sourceType !== before.sourceType) changes.sourceType = [before.sourceType, checked.sourceType];
  if (checked.distributor !== before.distributor) changes.distributor = [before.distributor, checked.distributor];
  if (cols.box_position !== before.boxPosition && !legacyCase) changes.boxPosition = [before.boxPosition, cols.box_position];
  let action = 'listing.updated';
  if (patch.isActive !== undefined && Boolean(isActive) !== before.isActive) action = isActive ? 'listing.resumed' : 'listing.paused';
  await audit({ ...actor(req), action, entityType: 'listing', entityId: row.id, details: { product: row.product_name, changes } });
  res.json(fullListingDto(await loadMine(row.id, req.user.id)));
});

// ---- Money -------------------------------------------------------------------------

router.get('/earnings', async (req, res) => {
  const f = parse(z.object({ status: z.enum(['all', 'available', 'in_payout', 'paid', 'reversed']).default('all'), ...page }), req.query);
  const where = ['seller_id = ?'];
  const params = [req.user.id];
  if (f.status !== 'all') { where.push('status = ?'); params.push(f.status); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM seller_earnings ${whereSql}`, params);
  const [rows] = await pool.query(`SELECT * FROM seller_earnings ${whereSql} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  res.json({
    summary: await earningTotals(req.user.id),
    commissionBps: config.commissionBps,
    items: rows.map(earningDto),
    total: Number(total),
    limit: f.limit,
    offset: f.offset,
  });
});

router.get('/payouts', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT p.*, sp.display_name FROM payouts p JOIN seller_profiles sp ON sp.user_id = p.seller_id WHERE p.seller_id = ? ORDER BY p.created_at DESC, p.id LIMIT 200',
    [req.user.id],
  );
  res.json({ items: rows.map(payoutDto) });
});

export default router;
