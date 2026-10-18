import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';
import { looseOffer, newUser, readyProducts } from './v4-helpers.js';

const looseBody = (productId, over = {}) => ({
  productId, priceCents: 9000, quantityAvailable: 10, sourceType: 'distributor', distributor: 'TSM Warehouse', packaging: 'loose', ...over,
});

describe("v5: TSM's own featured listings", () => {
  let t;
  let admin;
  let support;
  let hub;
  let hubId;
  let products;
  let tsm; // the featured listing on products[0]
  let houseId;
  let buyer;
  let order; // a buyer's order from TSM's store

  const post = (body, token = admin) => t.api('/api/staff/featured/listings', { method: 'POST', token, body });
  const patch = (id, body, token = admin) => t.api(`/api/staff/featured/listings/${id}`, { method: 'PATCH', token, body });
  const shop = async (productId, token) => (await t.api(`/api/products/${productId}`, { token })).json;

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    await pool.query(
      "INSERT INTO admin_staff (id, email, name, password_hash, role) VALUES (UUID(), 'support@tsm.test', 'Sam Support', ?, 'support')",
      [await hashPassword('SupportPass1!')],
    );
    support = await t.staffLogin('support@tsm.test', 'SupportPass1!');
    hub = await t.login('hub@tsm.test', DEMO_PASSWORD);
    hubId = (await t.api('/api/seller/me', { token: hub })).json.id;
    products = await readyProducts(t, admin, 2);
    await pool.query('DELETE FROM listings');
    buyer = await newUser(t, 'collector', { address: true });
  });
  after(() => t.stop());

  describe('posting one', () => {
    it("creates TSM's storefront the first time it is needed", async () => {
      assert.equal((await t.api('/api/staff/featured')).status, 401);
      const r = await t.api('/api/staff/featured', { token: support }); // every staff role may look
      assert.equal(r.status, 200);
      assert.equal(r.json.seller.displayName, 'TSM');
      assert.equal(r.json.listings.total, 0);
      houseId = r.json.seller.id;
      const again = await t.api('/api/staff/featured', { token: admin });
      assert.equal(again.json.seller.id, houseId); // one storefront, however often it is asked for
    });

    it('follows the same flow a seller uses: finished products only, same checks', async () => {
      assert.equal((await post(looseBody(products[0]), support)).status, 403); // the read-only role may not post
      assert.equal((await post(looseBody(products[0], { priceCents: 0 }))).status, 400);
      assert.equal((await post(looseBody(products[0], { quantityAvailable: -1 }))).status, 400);
      assert.equal((await post(looseBody(products[0], { distributor: '' }))).status, 400);
      assert.equal((await post(looseBody(products[0], { packaging: 'case' }))).status, 400); // a case needs its box numbers
      const unfinished = (await t.api('/api/staff/products?limit=50', { token: admin })).json.items.find((p) => !p.isReady);
      assert.equal((await post(looseBody(unfinished.id))).status, 400);

      const r = await post(looseBody(products[0]));
      assert.equal(r.status, 201);
      tsm = r.json;
      assert.equal(tsm.isFeatured, true);
      assert.equal(tsm.sellerName, 'TSM');
      assert.equal(tsm.sellerId, houseId);
      assert.equal(tsm.priceCents, 9000);
      assert.equal(tsm.status, 'live');
      assert.equal((await t.api('/api/staff/featured', { token: admin })).json.listings.live, 1);
    });

    it('can come from a case, with the next box handed out on each sale', async () => {
      const r = await post({ ...looseBody(products[1]), packaging: 'case', boxNumber: 3, boxesInCase: 12, quantityAvailable: 5 });
      assert.equal(r.status, 201);
      assert.equal(r.json.boxPosition, 'Box 3 of 12');
      assert.equal((await patch(r.json.id, { isActive: false })).json.status, 'paused');
    });

    it('is found in the catalog picker and in its own list, with the same sort choices as the rest of the admin', async () => {
      const catalog = await t.api('/api/staff/featured/catalog', { token: admin });
      assert.equal(catalog.status, 200);
      assert.equal(catalog.json.items.find((p) => p.id === products[0]).myListingCount, 1);
      const list = await t.api('/api/staff/featured/listings', { token: support });
      assert.equal(list.json.total, 2);
      assert.equal((await t.api('/api/staff/featured/listings?status=live', { token: admin })).json.total, 1);
      assert.equal((await t.api('/api/staff/featured/listings?status=paused', { token: admin })).json.total, 1);
      for (const sort of ['name', 'newest', 'oldest']) assert.equal((await t.api(`/api/staff/featured/listings?sort=${sort}`, { token: admin })).status, 200, sort);
      assert.equal((await t.api('/api/staff/featured/listings?sort=sideways', { token: admin })).status, 400);
      const newest = (await t.api('/api/staff/featured/listings?sort=newest', { token: admin })).json.items.map((i) => i.id);
      const oldest = (await t.api('/api/staff/featured/listings?sort=oldest', { token: admin })).json.items.map((i) => i.id);
      assert.deepEqual(oldest, [...newest].reverse());
    });

    it('can be edited, paused and resumed by an admin; an admin hold does not lock TSM out of its own offer', async () => {
      assert.equal((await patch(tsm.id, { priceCents: 9500 }, support)).status, 403);
      const r = await patch(tsm.id, { priceCents: 9500, quantityAvailable: 8 });
      assert.equal(r.json.priceCents, 9500);
      assert.equal(r.json.quantityAvailable, 8);
      assert.equal((await patch(tsm.id, { isActive: false })).json.status, 'paused');
      assert.equal((await patch(tsm.id, { isActive: true })).json.status, 'live');
      await t.api(`/api/staff/listings/${tsm.id}/hold`, { method: 'POST', token: admin, body: { reason: 'Checking stock count' } });
      assert.equal((await patch(tsm.id, { isActive: false })).status, 200);
      assert.equal((await patch(tsm.id, { isActive: true })).status, 200); // a seller could not do this while on hold
      await t.api(`/api/staff/listings/${tsm.id}/release`, { method: 'POST', token: admin, body: {} });
      assert.equal((await patch(tsm.id, { priceCents: 9000, quantityAvailable: 10 })).status, 200);
    });

    it("never touches a seller's offer through the featured routes", async () => {
      const mine = await looseOffer(t, hub, products[0], { priceCents: 5000 });
      assert.equal((await patch(mine.id, { priceCents: 1 })).status, 404);
      assert.equal((await t.api(`/api/staff/featured/listings/${mine.id}`, { token: admin })).status, 404);
      assert.equal((await t.api('/api/staff/featured/listings/not-a-uuid', { token: admin })).status, 404);
    });
  });

  describe('where buyers see it', () => {
    it("is always first, even when a seller is cheaper, and carries the TSM flags", async () => {
      // hub sells the same product for $50.00; TSM asks $90.00.
      const page = await shop(products[0]);
      assert.equal(page.listings.length, 2);
      assert.equal(page.listings[0].id, tsm.id);
      assert.equal(page.listings[0].isFeatured, true);
      assert.equal(page.listings[0].seller.isTsm, true);
      assert.equal(page.listings[0].seller.displayName, 'TSM');
      assert.equal(page.listings[1].isFeatured, false);
      assert.equal(page.listings[1].seller.isTsm, false);
      assert.ok(page.listings[0].priceCents > page.listings[1].priceCents);
      // the shop-wide "from $x" still shows the real lowest price
      assert.equal(page.lowestPriceCents, 5000);
    });

    it("stays first even for the seller whose own offer is normally pinned to the top", async () => {
      const page = await shop(products[0], hub);
      assert.deepEqual(page.listings.map((l) => [l.isFeatured, l.isMine]), [[true, false], [false, true]]);
    });

    it('stays first whatever the price: cheaper than every seller, or dearer', async () => {
      await patch(tsm.id, { priceCents: 1000 });
      assert.equal((await shop(products[0])).listings[0].id, tsm.id);
      await patch(tsm.id, { priceCents: 99900 });
      assert.equal((await shop(products[0])).listings[0].id, tsm.id);
      await patch(tsm.id, { priceCents: 9000 });
    });

    it('leaves the shop when paused or sold out, like any offer', async () => {
      await patch(tsm.id, { isActive: false });
      assert.equal((await shop(products[0])).listings.every((l) => !l.isFeatured), true);
      await patch(tsm.id, { isActive: true });
      assert.equal((await shop(products[0])).listings[0].isFeatured, true);
    });
  });

  describe('selling it', () => {
    it('is bought like any offer, takes no fee and writes nothing to the earnings ledger', async () => {
      const placed = await t.api('/api/orders', { method: 'POST', token: buyer.token, body: { items: [{ listingId: tsm.id, quantity: 2 }] } });
      assert.equal(placed.status, 201);
      order = placed.json.orders[0];
      assert.equal(order.seller.isTsm, true);
      assert.equal(order.seller.displayName, 'TSM');
      assert.equal(order.subtotalCents, 18000);
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM seller_earnings WHERE order_ref = ?', [order.orderNumber]);
      assert.equal(Number(count.n), 0);
      assert.equal((await shop(products[0])).listings.find((l) => l.id === tsm.id).quantityAvailable, 8);
      const [[sp]] = await pool.query('SELECT sales_count FROM seller_profiles WHERE user_id = ?', [houseId]);
      assert.equal(Number(sp.sales_count), 2);
    });

    it("can't be bought by a hub order's rules getting mixed up: a seller's order still pays out normally", async () => {
      const [sellerOffer] = (await t.api('/api/seller/listings', { token: hub })).json.items;
      const placed = await t.api('/api/orders', { method: 'POST', token: buyer.token, body: { items: [{ listingId: sellerOffer.id, quantity: 1 }] } });
      assert.equal(placed.status, 201);
      const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM seller_earnings WHERE order_ref = ?', [placed.json.orders[0].orderNumber]);
      assert.equal(Number(count.n), 1);
    });

    it("shows up in the admin's orders, filtered by seller, with no fee line", async () => {
      const all = await t.api('/api/staff/orders', { token: support });
      assert.equal(all.json.total, 2);
      const tsmOnly = await t.api(`/api/staff/orders?sellerId=${houseId}`, { token: support });
      assert.equal(tsmOnly.json.total, 1);
      assert.equal(tsmOnly.json.items[0].id, order.id);
      assert.equal(tsmOnly.json.items[0].fees, null);
      const hubOnly = await t.api(`/api/staff/orders?sellerId=${hubId}`, { token: support });
      assert.equal(hubOnly.json.total, 1);
      assert.equal(hubOnly.json.items[0].fees.tsmFeeBps, 500);
      assert.equal((await t.api('/api/staff/featured', { token: admin })).json.ordersToShip, 1);
    });

    it("is shipped by TSM staff, not by a seller, and only for TSM's own orders", async () => {
      const body = { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' };
      const ship = (id, token = admin, b = body) => t.api(`/api/staff/orders/${id}/ship`, { method: 'POST', token, body: b });
      assert.equal((await ship(order.id, support)).status, 403);
      assert.equal((await ship(order.id, admin, { carrier: 'Pigeon', trackingNumber: '1Z999AA10123456784' })).status, 400);
      const hubOrder = (await t.api('/api/staff/orders?sellerId=' + hubId, { token: admin })).json.items[0];
      const refused = await ship(hubOrder.id);
      assert.equal(refused.status, 409); // a real seller ships their own orders
      assert.equal((await t.api(`/api/seller/orders/${order.id}/ship`, { method: 'POST', token: hub, body })).status, 404);

      const r = await ship(order.id);
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'shipped');
      assert.equal(r.json.trackingUrl, 'https://www.ups.com/track?tracknum=1Z999AA10123456784');
      const seen = (await t.api(`/api/orders/${order.id}`, { token: buyer.token })).json;
      assert.equal(seen.status, 'shipped');
      assert.equal((await t.api('/api/staff/featured', { token: admin })).json.ordersToShip, 0);
    });

    it('can be written to the buyer about, and the buyer can answer', async () => {
      const send = (token, body) => t.api(`/api/staff/orders/${order.id}/messages`, { method: 'POST', token, body: { body } });
      assert.equal((await send(support, 'Hello')).status, 403);
      assert.equal((await send(admin, '')).status, 400);
      const r = await send(admin, 'Your order is on its way.');
      assert.equal(r.status, 201);
      const chat = await t.api(`/api/orders/${order.id}/messages`, { token: buyer.token });
      const last = chat.json.items.at(-1);
      assert.equal(last.body, 'Your order is on its way.');
      assert.equal(last.senderType, 'seller');
      assert.equal(last.senderName, 'TSM');
      assert.equal(last.mine, false);
      assert.equal((await t.api(`/api/orders/${order.id}/messages`, { method: 'POST', token: buyer.token, body: { body: 'Thank you!' } })).status, 201);
    });

    it("is reviewed like any seller's sale", async () => {
      const r = await t.api(`/api/orders/${order.id}/items/${order.items[0].id}/review`, { method: 'POST', token: buyer.token, body: { rating: 5, comment: 'Great.' } });
      assert.equal(r.status, 201);
      const reviews = await t.api(`/api/products/${products[0]}/reviews?sellerId=${houseId}`);
      assert.equal(reviews.json.summary.count, 1);
      assert.equal(reviews.json.seller.isTsm, true);
      assert.equal((await shop(products[0])).listings[0].seller.productReviews.count, 1);
    });
  });

  describe('kept apart from real sellers and people', () => {
    it("is not listed as a seller, a user, a payout or a seller to suspend", async () => {
      const sellers = await t.api('/api/staff/sellers?limit=200', { token: admin });
      assert.ok(!sellers.json.items.some((s) => s.id === houseId));
      assert.equal(sellers.json.total, sellers.json.items.length);
      const users = await t.api('/api/staff/users?limit=200', { token: admin });
      assert.ok(!users.json.items.some((u) => u.id === houseId));
      const payouts = await t.api('/api/staff/payouts/overview', { token: admin });
      assert.ok(!payouts.json.sellers.some((s) => s.sellerId === houseId));
      const dash = await t.api('/api/staff/dashboard', { token: admin });
      const [[real]] = await pool.query('SELECT COUNT(*) AS n FROM seller_profiles WHERE is_house = 0');
      assert.equal(dash.json.sellers.total, Number(real.n));
    });

    it('can still be found by the admin seller search, marked as TSM, and its offers show in the offers list', async () => {
      const found = await t.api('/api/staff/seller-search?q=TSM', { token: support });
      assert.equal(found.status, 200);
      assert.deepEqual([found.json.items[0].id, found.json.items[0].isTsm], [houseId, true]); // TSM's own store sorts first
      assert.equal(found.json.items.filter((s) => s.isTsm).length, 1);
      const byId = await t.api(`/api/staff/seller-search?id=${houseId}`, { token: support });
      assert.deepEqual(byId.json.items.map((s) => [s.id, s.displayName, s.isTsm]), [[houseId, 'TSM', true]]);
      assert.equal((await t.api('/api/staff/seller-search?id=nope', { token: support })).status, 400);
      const hubFound = await t.api('/api/staff/seller-search?q=hub', { token: support });
      assert.equal(hubFound.json.items[0].id, hubId);
      assert.equal(hubFound.json.items[0].isTsm, false);
      const listings = await t.api(`/api/staff/listings?sellerId=${houseId}`, { token: admin });
      assert.ok(listings.json.items.length >= 1);
      assert.ok(listings.json.items.every((l) => l.isFeatured === true));
    });

    it("can't be signed in to, so nobody can act as TSM's storefront", async () => {
      for (const login of ['TSM Official', 'tsm-official@tsm.invalid', 'TSM']) {
        const r = await t.api('/api/auth/login', { method: 'POST', body: { login, password: DEMO_PASSWORD } });
        assert.ok([400, 401, 403].includes(r.status), `${login}: ${r.status}`);
      }
    });

    it('can be favorited and does not break an account export', async () => {
      assert.equal((await t.api(`/api/me/favorite-sellers/${houseId}`, { method: 'PUT', token: buyer.token })).status, 200);
      const exp = await t.api('/api/me/export', { token: buyer.token });
      assert.equal(exp.status, 200);
      assert.deepEqual(exp.json.favoriteSellers.map((f) => f.seller), ['TSM']);
    });
  });
});
