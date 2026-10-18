// Staff: TSM's own featured listings.
//
// An admin can post TSM's own product exactly the way a seller does: pick a finished product from the catalog, then set the
// price, stock, where it came from, and box or loose. The offer belongs to TSM's own storefront (the "house seller"), so it:
//   * always sits at the top of the product's offers, even when it is not the cheapest, and the app draws it with a purple border
//   * is bought, shipped, messaged and reviewed like any seller's offer
//   * takes no TSM fee and is never paid out (there is nobody to pay), so it writes nothing to the earnings ledger
//
//   GET   /api/staff/featured                    TSM's storefront: its id, offer counts, orders waiting to ship
//   GET   /api/staff/featured/catalog            ?q, brandId, typeId, limit, offset  finished products to pick from
//   GET   /api/staff/featured/listings           ?status=all|live|paused|on_hold|sold_out, brandId, typeId, q, sort=name|newest|oldest, limit, offset
//   GET   /api/staff/featured/listings/:id
//   POST  /api/staff/featured/listings           {productId, priceCents, quantityAvailable, sourceType, distributor, packaging, boxNumber?, boxesInCase?}
//   PATCH /api/staff/featured/listings/:id       any of those (not productId) and isActive (pause / resume)
//   POST  /api/staff/orders/:id/ship             {carrier, trackingNumber}  ship an order TSM's own store sold (sellers ship their own)
//   POST  /api/staff/orders/:id/messages         {body}  write to the buyer of an order TSM's own store sold
//
// Reading is open to every staff role; posting, changing and shipping needs "admin" or "super_admin".
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { MESSAGE_MAX, addMessage, countMessages, messageDto } from '../lib/conversations.js';
import { ensureHouseSeller } from '../lib/house.js';
import { LISTING_STATUS_SQL, createListingFor, listListingsFor, loadListingOf, readyProducts, updateListingFor } from '../lib/listingWrites.js';
import { createListingBody, fullListingDto, patchListingBody } from '../lib/listings.js';
import { loadOrderFor, shipBody, shipOrder } from '../lib/orders.js';
import { sortParam } from '../lib/sort.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();
const read = requireStaff();
const write = requireStaff('super_admin', 'admin');
const actor = (req) => ({ actorType: 'staff', actorId: req.staff.id, ip: req.ip });
const page = { limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) };
const messageBody = z.object({ body: z.string({ error: 'Write a message' }).trim().min(1, 'Write a message').max(MESSAGE_MAX, 'That message is too long') });

function idParam(req) {
  if (!UUID_RE.test(req.params.id)) throw notFound('Not found');
  return req.params.id;
}

router.get('/featured', read, async (req, res) => {
  const houseId = await ensureHouseSeller();
  const [[seller]] = await pool.query('SELECT display_name, rating_avg, rating_count, sales_count FROM seller_profiles WHERE user_id = ?', [houseId]);
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(l.is_active = 1 AND l.admin_hold = 0 AND l.quantity_available > 0), 0) AS live,
            COALESCE(SUM(l.admin_hold = 0 AND l.is_active = 0), 0) AS paused,
            COALESCE(SUM(l.admin_hold = 1), 0) AS onHold,
            COALESCE(SUM(l.admin_hold = 0 AND l.is_active = 1 AND l.quantity_available = 0), 0) AS soldOut,
            COALESCE(SUM(CASE WHEN l.is_active = 1 AND l.admin_hold = 0 THEN l.quantity_available END), 0) AS unitsInStock
       FROM listings l WHERE l.seller_id = ?`,
    [houseId],
  );
  const [[toShip]] = await pool.query("SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND status = 'placed'", [houseId]);
  res.json({
    seller: { id: houseId, displayName: seller.display_name, ratingAvg: Number(seller.rating_avg), ratingCount: seller.rating_count, salesCount: seller.sales_count },
    listings: {
      total: Number(stats.total), live: Number(stats.live), paused: Number(stats.paused),
      onHold: Number(stats.onHold), soldOut: Number(stats.soldOut), unitsInStock: Number(stats.unitsInStock),
    },
    ordersToShip: Number(toShip.n),
  });
});

router.get('/featured/catalog', read, async (req, res) => {
  const f = parse(
    z.object({
      q: z.string().trim().min(1).max(100).optional(),
      brandId: z.string().regex(UUID_RE).optional(),
      typeId: z.string().regex(UUID_RE).optional(),
      ...page,
    }),
    req.query,
  );
  res.json(await readyProducts(f, await ensureHouseSeller()));
});

router.get('/featured/listings', read, async (req, res) => {
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
  res.json(await listListingsFor(await ensureHouseSeller(), f));
});

router.get('/featured/listings/:id', read, async (req, res) => {
  res.json(fullListingDto(await loadListingOf(idParam(req), await ensureHouseSeller())));
});

router.post('/featured/listings', write, async (req, res) => {
  const body = parse(createListingBody, req.body);
  const houseId = await ensureHouseSeller();
  const id = await createListingFor(houseId, body, actor(req));
  res.status(201).json(fullListingDto(await loadListingOf(id, houseId)));
});

router.patch('/featured/listings/:id', write, async (req, res) => {
  const houseId = await ensureHouseSeller();
  const row = await loadListingOf(idParam(req), houseId);
  const patch = parse(patchListingBody, req.body);
  // Staff are the ones in charge of TSM's own offers, so an admin hold does not stop them resuming one.
  await updateListingFor(row, patch, actor(req), { ignoreHold: true });
  res.json(fullListingDto(await loadListingOf(row.id, houseId)));
});

// ---- Orders TSM's own store sold ----------------------------------------------------------------

async function houseOrder(req) {
  const houseId = await ensureHouseSeller();
  const order = await loadOrderFor(idParam(req), {}, 'staff');
  if (order.seller.id !== houseId) throw conflict('Only orders sold by TSM’s own store are shipped and answered by TSM. This one belongs to a seller.');
  return order;
}

router.post('/orders/:id/ship', write, async (req, res) => {
  const order = await houseOrder(req);
  const body = parse(shipBody, req.body);
  await shipOrder(order, body, actor(req));
  res.json(await loadOrderFor(order.id, {}, 'staff'));
});

router.post('/orders/:id/messages', write, async (req, res) => {
  const order = await houseOrder(req);
  const { body } = parse(messageBody, req.body);
  if ((await countMessages('order', order.id)) >= 500) throw conflict('This conversation is full.');
  // In the buyer's chat it reads as a message from the seller - and the seller here is TSM.
  const row = await addMessage({ kind: 'order', threadId: order.id, senderType: 'seller', senderId: req.staff.id, senderName: 'TSM', body });
  res.status(201).json(messageDto(row, ['seller']));
});

export default router;
