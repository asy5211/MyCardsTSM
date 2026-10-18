// The seller portal API: approved sellers manage their own offers and look at their money.
//
//   GET   /api/seller/me                 profile, the distributors they named in their application, the fees taken from each sale
//   GET   /api/seller/dashboard          offer counts, stock, balances, orders waiting to ship, latest sales
//   GET   /api/seller/catalog            ?q, brandId, typeId, limit, offset  the products TSM staff made (ready ones only)
//   GET   /api/seller/listings           ?status=all|live|paused|on_hold|sold_out, brandId, typeId, q, sort=name|newest|oldest, limit, offset
//
// Sold orders, shipping, reviews, sales rates and the payout method are in sellerSales.js (same /api/seller prefix).
//   GET   /api/seller/listings/:id       one of my offers
//   POST  /api/seller/listings           {productId, priceCents, quantityAvailable, sourceType, distributor,
//                                         packaging: "case"|"loose", boxNumber?, boxesInCase?}
//   PATCH /api/seller/listings/:id       any of the fields above (not productId) and isActive (pause / resume)
//   GET   /api/seller/earnings           ?status, sort=newest|oldest, limit, offset  sales ledger + balances
//   GET   /api/seller/payouts            payouts TSM has made or queued
//
// Only a signed-in person whose seller application was approved (and who is not suspended) gets in.
// Sellers can only offer products that staff created and finished (description + main photo),
// and can only touch their own offers.
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { earningDto, earningTotals, payoutDto } from '../lib/earnings.js';
import { LISTING_STATUS_SQL, createListingFor, listListingsFor, loadListingOf, readyProducts, updateListingFor } from '../lib/listingWrites.js';
import { createListingBody, fullListingDto, patchListingBody } from '../lib/listings.js';
import { getFees } from '../lib/settings.js';
import { dir, sortParam } from '../lib/sort.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireSeller, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser, requireSeller);

const iso = (d) => (d ? new Date(d).toISOString() : null);
const actor = (req) => ({ actorType: 'user', actorId: req.user.id, ip: req.ip });
const page = { limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) };

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
  const fees = await getFees();
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
    // What is taken from each sale before the seller is paid: TSM's flat fee plus the payment (Apple) fee. Both are set by an admin.
    fees,
    commissionBps: fees.tsmFeeBps,
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
  const [[toShip]] = await pool.query("SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND status = 'placed'", [id]);
  const [recent] = await pool.query('SELECT * FROM seller_earnings WHERE seller_id = ? ORDER BY created_at DESC, id LIMIT 5', [id]);
  // Help requests from buyers about this seller's orders that are waiting for an answer (TSM-handled ones are not the seller's to answer).
  const [[support]] = await pool.query(
    "SELECT COUNT(*) AS n FROM support_requests WHERE seller_id = ? AND handler = 'seller' AND status = 'open'",
    [id],
  );
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
    ordersToShip: Number(toShip.n),
    supportToAnswer: Number(support.n),
    fees: await getFees(),
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
  res.json(await readyProducts(f, req.user.id));
});

// ---- My offers ---------------------------------------------------------------------

router.get('/listings', async (req, res) => {
  const f = parse(
    z.object({
      status: z.enum(['all', ...Object.keys(LISTING_STATUS_SQL)]).default('all'),
      brandId: z.string().regex(UUID_RE).optional(),
      typeId: z.string().regex(UUID_RE).optional(),
      q: z.string().trim().min(1).max(100).optional(),
      sort: sortParam(['name', 'newest', 'oldest'], 'name'),
      ...page,
    }),
    req.query,
  );
  res.json(await listListingsFor(req.user.id, f));
});

const loadMine = loadListingOf;

router.get('/listings/:id', async (req, res) => {
  res.json(fullListingDto(await loadMine(req.params.id, req.user.id)));
});

router.post('/listings', async (req, res) => {
  const body = parse(createListingBody, req.body);
  const id = await createListingFor(req.user.id, body, actor(req));
  res.status(201).json(fullListingDto(await loadMine(id, req.user.id)));
});

router.patch('/listings/:id', async (req, res) => {
  const row = await loadMine(req.params.id, req.user.id);
  const patch = parse(patchListingBody, req.body);
  await updateListingFor(row, patch, actor(req));
  res.json(fullListingDto(await loadMine(row.id, req.user.id)));
});

// ---- Money -------------------------------------------------------------------------

router.get('/earnings', async (req, res) => {
  const f = parse(z.object({ status: z.enum(['all', 'available', 'in_payout', 'paid', 'reversed']).default('all'), sort: sortParam(), ...page }), req.query);
  const where = ['seller_id = ?'];
  const params = [req.user.id];
  if (f.status !== 'all') { where.push('status = ?'); params.push(f.status); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM seller_earnings ${whereSql}`, params);
  const [rows] = await pool.query(`SELECT * FROM seller_earnings ${whereSql} ORDER BY created_at ${dir(f.sort)}, id ${dir(f.sort)} LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  res.json({
    summary: await earningTotals(req.user.id),
    fees: await getFees(),
    commissionBps: (await getFees()).tsmFeeBps,
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
