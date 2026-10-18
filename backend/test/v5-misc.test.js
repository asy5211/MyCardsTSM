import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { recordSaleEarning } from '../src/lib/earnings.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';
import { looseOffer, newUser, readyProducts } from './v4-helpers.js';

const HOUR = 3_600_000;
const YEAR_NOW = new Date().getUTCFullYear();

describe('v5: reviews, favorite sellers, fee snapshots, yearly sales, sorting', () => {
  let t;
  let admin;
  let support;
  let hub;
  let hubId;
  let seller;
  let sellerId;
  let buyer;
  let products;
  let hubOffers; // hub's offer per product
  let sellerOffer; // the other seller's offer on products[0]

  const buy = async (token, listingId, quantity = 1) => {
    const r = await t.api('/api/orders', { method: 'POST', token, body: { items: [{ listingId, quantity }] } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.orders[0];
  };
  const review = (order, token, body) => t.api(`/api/orders/${order.id}/items/${order.items[0].id}/review`, { method: 'POST', token, body });
  const page = async (productId, token) => (await t.api(`/api/products/${productId}`, { token })).json;
  const offerOf = (shop, sellerId) => shop.listings.find((l) => l.seller.id === sellerId);
  const setFees = (body) => t.api('/api/staff/settings/fees', { method: 'PUT', token: admin, body });

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
    seller = await t.login('seller@tsm.test', DEMO_PASSWORD);
    sellerId = (await t.api('/api/seller/me', { token: seller })).json.id;
    products = await readyProducts(t, admin, 3);
    await pool.query('DELETE FROM listings');
    await pool.query('DELETE FROM seller_earnings');
    await pool.query('DELETE FROM payouts');
    buyer = await newUser(t, 'buyer', { address: true });
    hubOffers = [];
    for (const p of products) hubOffers.push(await looseOffer(t, hub, p, { priceCents: 5000 }));
    sellerOffer = await looseOffer(t, seller, products[0], { priceCents: 4500 });
  });
  after(() => t.stop());

  describe('reviewing as soon as you bought it', () => {
    let hubOrder;
    let sellerOrder;

    it('lets the buyer review right after the purchase, before anything ships', async () => {
      const placed = await t.api('/api/orders', { method: 'POST', token: buyer.token, body: { items: [{ listingId: hubOffers[0].id, quantity: 1 }, { listingId: sellerOffer.id, quantity: 1 }] } });
      assert.equal(placed.status, 201);
      hubOrder = placed.json.orders.find((o) => o.seller.id === hubId);
      sellerOrder = placed.json.orders.find((o) => o.seller.id === sellerId);
      assert.equal(hubOrder.status, 'placed');
      const r = await review(hubOrder, buyer.token, { rating: 5, comment: 'Quick and well packed.' });
      assert.equal(r.status, 201);
      assert.equal(r.json.rating, 5);
      assert.equal((await t.api(`/api/orders/${hubOrder.id}`, { token: buyer.token })).json.items[0].review.rating, 5);
    });

    it('checks the rating, allows one review per item, and keeps other people out', async () => {
      assert.equal((await review(hubOrder, buyer.token, { rating: 1 })).status, 409);
      assert.equal((await review(sellerOrder, buyer.token, { rating: 0 })).status, 400);
      const stranger = await newUser(t, 'stranger', { address: true });
      assert.equal((await review(sellerOrder, stranger.token, { rating: 4 })).status, 404);
      assert.equal((await review(sellerOrder, undefined, { rating: 4 })).status, 401);
    });

    it('refuses a cancelled order, and works again if it is not cancelled', async () => {
      await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [sellerOrder.id]);
      const refused = await review(sellerOrder, buyer.token, { rating: 3 });
      assert.equal(refused.status, 409);
      assert.match(refused.json.error.message, /cancelled/);
      await pool.query("UPDATE orders SET status = 'placed' WHERE id = ?", [sellerOrder.id]);
      assert.equal((await review(sellerOrder, buyer.token, { rating: 3, comment: 'Took a while to answer.' })).status, 201);
    });

    it('is seen by the seller, who can answer it', async () => {
      const mine = await t.api('/api/seller/reviews', { token: hub });
      assert.equal(mine.json.total, 1);
      assert.equal(mine.json.items[0].rating, 5);
      assert.equal((await t.api(`/api/seller/reviews/${mine.json.items[0].id}/respond`, { method: 'POST', token: hub, body: { response: 'Thank you!' } })).status, 200);
    });
  });

  describe("a seller's reviews appear on their own offer, not on the whole product", () => {
    it('gives every offer its own seller’s reviews of this product only', async () => {
      const shop = await page(products[0]);
      assert.deepEqual(offerOf(shop, hubId).seller.productReviews, { count: 1, average: 5 });
      assert.deepEqual(offerOf(shop, sellerId).seller.productReviews, { count: 1, average: 3 });
      // nothing at product level: a review is about the seller, not the listing
      for (const key of ['rating', 'ratingCount', 'reviewCount', 'reviews', 'productReviews']) assert.equal(shop[key], undefined, key);
    });

    it("doesn't carry a seller’s reviews of one product onto another product they sell", async () => {
      const other = await buy(buyer.token, hubOffers[1].id);
      assert.equal((await review(other, buyer.token, { rating: 1, comment: 'Not as described.' })).status, 201);
      const first = await page(products[0]);
      const second = await page(products[1]);
      assert.deepEqual(offerOf(first, hubId).seller.productReviews, { count: 1, average: 5 }); // unchanged
      assert.deepEqual(offerOf(second, hubId).seller.productReviews, { count: 1, average: 1 });
      assert.deepEqual(offerOf(await page(products[2]), hubId).seller.productReviews, { count: 0, average: 0 });
      // the seller's overall star rating still counts every product they sold
      assert.equal(offerOf(first, hubId).seller.rating, 3);
      assert.equal(offerOf(first, hubId).seller.ratingCount, 2);
    });

    it('lists the reviews one seller got for one product, and nothing without a seller', async () => {
      assert.equal((await t.api(`/api/products/${products[0]}/reviews`)).status, 400);
      const hubOnly = await t.api(`/api/products/${products[0]}/reviews?sellerId=${hubId}`);
      assert.equal(hubOnly.json.summary.count, 1);
      assert.equal(hubOnly.json.items[0].rating, 5);
      assert.equal(hubOnly.json.items[0].sellerName, 'Collector Hub');
      const sellerOnly = await t.api(`/api/products/${products[0]}/reviews?sellerId=${sellerId}`);
      assert.equal(sellerOnly.json.items[0].rating, 3);
      assert.equal((await t.api(`/api/products/${products[1]}/reviews?sellerId=${sellerId}`)).json.summary.count, 0);
      assert.equal((await t.api(`/api/products/${products[1]}/reviews?sellerId=${hubId}`)).json.items[0].rating, 1);
    });
  });

  describe('favorite sellers', () => {
    const fav = (id, method = 'PUT', token = buyer.token) => t.api(`/api/me/favorite-sellers/${id}`, { method, token });
    const list = async (token = buyer.token) => (await t.api('/api/me/favorite-sellers', { token })).json.items;

    it('needs a sign-in, and starts empty', async () => {
      assert.equal((await t.api('/api/me/favorite-sellers')).status, 401);
      assert.equal((await fav(hubId, 'PUT', null)).status, 401);
      assert.deepEqual(await list(), []);
    });

    it('hearts a seller (twice is fine) and lists them with their shop details', async () => {
      assert.deepEqual((await fav(hubId)).json, { sellerId: hubId, isFavorite: true });
      assert.equal((await fav(hubId)).status, 200);
      const items = await list();
      assert.equal(items.length, 1);
      assert.equal(items[0].id, hubId);
      assert.equal(items[0].displayName, 'Collector Hub');
      assert.equal(items[0].liveListingCount, 3);
      assert.equal(items[0].isTsm, false);
      assert.ok(items[0].favoritedAt);
    });

    it("shows the heart on that seller's offers, for that person only", async () => {
      const mine = await page(products[0], buyer.token);
      assert.equal(offerOf(mine, hubId).seller.isFavorite, true);
      assert.equal(offerOf(mine, sellerId).seller.isFavorite, false);
      const other = await newUser(t, 'viewer');
      assert.equal(offerOf(await page(products[0], other.token), hubId).seller.isFavorite, false);
      assert.equal(offerOf(await page(products[0]), hubId).seller.isFavorite, false); // a guest
    });

    it('refuses your own store, unknown sellers and sellers who are not selling', async () => {
      const own = await fav(hubId, 'PUT', hub);
      assert.equal(own.status, 400);
      assert.equal(own.json.error.code, 'own_store');
      assert.equal((await fav(randomUUID())).status, 404);
      assert.equal((await fav('not-an-id')).status, 404);
      assert.equal((await fav(buyer.id)).status, 404); // an ordinary customer is not a seller
      await t.api(`/api/staff/sellers/${sellerId}/suspend`, { method: 'POST', token: admin, body: { reason: 'Testing favorites' } });
      assert.equal((await fav(sellerId)).status, 404);
      await t.api(`/api/staff/sellers/${sellerId}/reinstate`, { method: 'POST', token: admin, body: {} });
      assert.equal((await fav(sellerId)).status, 200);
    });

    it('drops a seller from the list while they are suspended', async () => {
      assert.equal((await list()).length, 2);
      await t.api(`/api/staff/sellers/${sellerId}/suspend`, { method: 'POST', token: admin, body: { reason: 'Testing favorites' } });
      assert.deepEqual((await list()).map((s) => s.id), [hubId]);
      await t.api(`/api/staff/sellers/${sellerId}/reinstate`, { method: 'POST', token: admin, body: {} });
      assert.equal((await list()).length, 2);
    });

    it('removes a heart, and removing twice is fine', async () => {
      assert.equal((await fav(sellerId, 'DELETE')).status, 204);
      assert.equal((await fav(sellerId, 'DELETE')).status, 204);
      assert.deepEqual((await list()).map((s) => s.id), [hubId]);
      assert.equal((await fav('not-an-id', 'DELETE')).status, 404);
    });

    it('is part of the data export, and is erased with the account', async () => {
      const exp = await t.api('/api/me/export', { token: buyer.token });
      assert.deepEqual(exp.json.favoriteSellers.map((f) => f.seller), ['Collector Hub']);
      const leaver = await newUser(t, 'leaver');
      assert.equal((await fav(hubId, 'PUT', leaver.token)).status, 200);
      const gone = await t.api('/api/me', { method: 'DELETE', token: leaver.token, body: { password: 'Sup3r$ecret' } });
      assert.equal(gone.status, 204);
      const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM favorite_sellers WHERE user_id = ?', [leaver.id]);
      assert.equal(Number(row.n), 0);
    });
  });

  describe('fees are dynamic, and a sale keeps the rates it was made at', () => {
    let first; // sold at 5% + 10%
    let second; // sold at 7% + 15%
    let third; // sold at 45% + 25%
    const earning = async (order) => (await pool.query('SELECT * FROM seller_earnings WHERE order_ref = ?', [order.orderNumber]))[0][0];
    const feesOf = async (order, token, base = '/api/seller/orders') => (await t.api(`${base}/${order.id}`, { token })).json.fees;

    it('takes 5% for TSM and 10% for Apple on a sale made at those rates', async () => {
      assert.equal((await setFees({ tsmFeeBps: 500, processingFeeBps: 1000 })).status, 200);
      first = await buy(buyer.token, hubOffers[2].id, 2); // 2 x $50.00
      const e = await earning(first);
      assert.deepEqual(
        [e.gross_cents, e.commission_bps, e.commission_cents, e.processing_fee_bps, e.processing_fee_cents, e.net_cents].map(Number),
        [10000, 500, 500, 1000, 1000, 8500],
      );
    });

    it('keeps that sale at 5% and 10% when the rates go up afterwards', async () => {
      assert.equal((await setFees({ tsmFeeBps: 700, processingFeeBps: 1500 })).status, 200);
      second = await buy(buyer.token, hubOffers[2].id, 1);
      const e1 = await earning(first);
      assert.deepEqual([e1.commission_bps, e1.processing_fee_bps, e1.commission_cents, e1.processing_fee_cents, e1.net_cents].map(Number), [500, 1000, 500, 1000, 8500]);
      const e2 = await earning(second);
      assert.deepEqual([e2.commission_bps, e2.processing_fee_bps, e2.commission_cents, e2.processing_fee_cents, e2.net_cents].map(Number), [700, 1500, 350, 750, 3900]);
    });

    it('has no preset ceiling: a 45% + 25% sale is recorded exactly', async () => {
      assert.equal((await setFees({ tsmFeeBps: 4500, processingFeeBps: 2500 })).status, 200);
      third = await buy(buyer.token, hubOffers[2].id, 1);
      const e = await earning(third);
      assert.deepEqual([e.commission_cents, e.processing_fee_cents, e.net_cents].map(Number), [2250, 1250, 1500]);
      assert.equal((await setFees({ tsmFeeBps: 500, processingFeeBps: 0 })).status, 200);
    });

    it('shows each sale at its own rates to the seller and to staff, but not to the buyer', async () => {
      const expected = [
        [first, { tsmFeeBps: 500, processingFeeBps: 1000, grossCents: 10000, commissionCents: 500, processingFeeCents: 1000, netCents: 8500 }],
        [second, { tsmFeeBps: 700, processingFeeBps: 1500, grossCents: 5000, commissionCents: 350, processingFeeCents: 750, netCents: 3900 }],
        [third, { tsmFeeBps: 4500, processingFeeBps: 2500, grossCents: 5000, commissionCents: 2250, processingFeeCents: 1250, netCents: 1500 }],
      ];
      for (const [order, fees] of expected) {
        assert.deepEqual(await feesOf(order, hub), fees);
        assert.deepEqual(await feesOf(order, admin, '/api/staff/orders'), fees);
        assert.equal((await t.api(`/api/orders/${order.id}`, { token: buyer.token })).json.fees, undefined);
      }
      const list = await t.api('/api/seller/orders', { token: hub });
      assert.ok(list.json.items.every((o) => o.fees && o.fees.netCents > 0));
    });

    it('keeps the seller’s ledger and sales totals at each sale’s own rates', async () => {
      const ledger = await t.api('/api/seller/earnings', { token: hub });
      const byRef = Object.fromEntries(ledger.json.items.map((i) => [i.orderRef, i]));
      assert.equal(byRef[first.orderNumber].commissionBps, 500);
      assert.equal(byRef[second.orderNumber].commissionBps, 700);
      assert.equal(byRef[third.orderNumber].processingFeeBps, 2500);
      const stats = await t.api('/api/seller/stats?period=day&count=1', { token: hub });
      const today = stats.json.totals;
      const [[sums]] = await pool.query("SELECT SUM(commission_cents) AS c, SUM(processing_fee_cents) AS p FROM seller_earnings WHERE seller_id = ? AND DATE(created_at) = UTC_DATE()", [hubId]);
      assert.equal(today.tsmFeeCents, Number(sums.c));
      assert.equal(today.processingFeeCents, Number(sums.p));
    });

    it('checks the numbers add up on every row (gross = TSM fee + payment fee + seller’s share)', async () => {
      const [[bad]] = await pool.query('SELECT COUNT(*) AS n FROM seller_earnings WHERE commission_cents + processing_fee_cents + net_cents <> gross_cents');
      assert.equal(Number(bad.n), 0);
    });
  });

  describe('yearly sales, with a 1 to 25 choice for every period', () => {
    const stats = (query, token = hub) => t.api(`/api/seller/stats${query}`, { token });
    const startOfYear = (y) => `${y}-01-01`;

    before(async () => {
      await pool.query('DELETE FROM seller_earnings WHERE seller_id = ?', [sellerId]);
      const sales = [
        { ref: 'Y-NOW', unit: 10000, at: new Date() },
        { ref: 'Y-LAST', unit: 20000, at: new Date(Date.UTC(YEAR_NOW - 1, 5, 15, 12)) },
        { ref: 'Y-OLD', unit: 30000, at: new Date(Date.UTC(YEAR_NOW - 3, 0, 1, 0, 30)) },
        { ref: 'Y-ANCIENT', unit: 40000, at: new Date(Date.UTC(YEAR_NOW - 9, 11, 31, 23, 30)) },
      ];
      for (const s of sales) {
        const e = await recordSaleEarning({ sellerId, productName: 'Old Stock', orderRef: s.ref, quantity: 1, unitPriceCents: s.unit, bps: 500, processingBps: 0 });
        await pool.query('UPDATE seller_earnings SET created_at = ? WHERE id = ?', [s.at, e.id]);
      }
    });

    it('shows the last 5 years, one bar per year, ending this year', async () => {
      const r = await stats('?period=year', seller);
      assert.equal(r.status, 200);
      assert.equal(r.json.period, 'year');
      assert.equal(r.json.count, 5);
      assert.deepEqual(r.json.buckets.map((b) => b.start), [4, 3, 2, 1, 0].map((n) => startOfYear(YEAR_NOW - n)));
      const gross = r.json.buckets.map((b) => b.grossCents);
      assert.deepEqual(gross, [0, 30000, 0, 20000, 10000]); // the sale 9 years ago is outside a 5-year window
      assert.equal(r.json.totals.grossCents, 60000);
      assert.equal(r.json.totals.tsmFeeCents, 3000); // 5%
      assert.equal(r.json.totals.netCents, 57000);
      assert.equal(r.json.averages.grossCents, 12000);
    });

    it('puts a sale on 1 January and one on 31 December in the right years', async () => {
      const r = await stats(`?period=year&count=10`, seller);
      const byYear = Object.fromEntries(r.json.buckets.map((b) => [b.start.slice(0, 4), b.grossCents]));
      assert.equal(byYear[YEAR_NOW - 3], 30000);
      assert.equal(byYear[YEAR_NOW - 9], 40000);
      assert.equal(r.json.totals.grossCents, 100000);
    });

    it('lets you pick any count from 1 to 25 for every period, and never more', async () => {
      for (const period of ['day', 'week', 'month', 'year']) {
        for (const count of [1, 2, 7, 25]) {
          const r = await stats(`?period=${period}&count=${count}`);
          assert.equal(r.status, 200, `${period} ${count}`);
          assert.equal(r.json.count, count, `${period} ${count}`);
          assert.equal(r.json.buckets.length, count, `${period} ${count}`);
        }
        assert.equal((await stats(`?period=${period}&count=26`)).json.count, 25, `${period} 26`);
        assert.equal((await stats(`?period=${period}&count=500`)).json.count, 25, `${period} 500`);
        assert.equal((await stats(`?period=${period}&count=0`)).status, 400, `${period} 0`);
      }
      assert.equal((await stats('?period=decade')).status, 400);
      assert.equal((await stats('?period=year&count=abc')).status, 400);
    });

    it('keeps the old defaults for day, week and month', async () => {
      assert.equal((await stats('?period=day')).json.count, 14);
      assert.equal((await stats('?period=week')).json.count, 12);
      assert.equal((await stats('?period=month')).json.count, 12);
    });
  });

  describe('newest first / oldest first on every list', () => {
    const ids = async (path, token, key = 'items') => (await t.api(path, { token })).json[key].map((i) => i.id);
    const both = async (path, token) => {
      const sep = path.includes('?') ? '&' : '?';
      return [await ids(`${path}${sep}sort=newest`, token), await ids(`${path}${sep}sort=oldest`, token)];
    };
    const reversed = async (path, token) => {
      const [newest, oldest] = await both(path, token);
      assert.ok(newest.length > 1, `${path} needs at least two rows to compare`);
      assert.deepEqual(oldest, [...newest].reverse(), path);
    };

    before(async () => {
      // give every list distinct timestamps so "newest" and "oldest" are exact opposites
      const spread = async (table, column, where = '1 = 1', params = [], pk = 'id') => {
        const [rows] = await pool.query(`SELECT ${pk} AS pk FROM ${table} WHERE ${where} ORDER BY ${pk}`, params);
        for (const [i, row] of rows.entries()) await pool.query(`UPDATE ${table} SET ${column} = ? WHERE ${pk} = ?`, [new Date(Date.now() - (i + 1) * 6 * HOUR), row.pk]);
      };
      await spread('orders', 'created_at');
      await spread('listings', 'created_at');
      await spread('products', 'created_at');
      await spread('seller_earnings', 'created_at', 'seller_id = ?', [hubId]);
      await spread('users', 'created_at');
      await spread('seller_profiles', 'approved_at', '1 = 1', [], 'user_id');
      await spread('reviews', 'created_at');
      for (let i = 0; i < 3; i++) {
        await pool.query(
          "INSERT INTO payouts (id, seller_id, amount_cents, earnings_count, status, created_at) VALUES (UUID(), ?, ?, 1, 'pending', ?)",
          [hubId, 1000 + i, new Date(Date.now() - (i + 1) * 5 * HOUR)],
        );
      }
    });

    it('works on the admin lists', async () => {
      for (const path of ['/api/staff/orders', '/api/staff/users', '/api/staff/listings', '/api/staff/products', '/api/staff/payouts', '/api/staff/earnings', '/api/staff/audit']) {
        await reversed(path, admin);
      }
      const sellers = await both('/api/staff/sellers', admin);
      assert.deepEqual(sellers[1], [...sellers[0]].reverse());
    });

    it('works on the seller portal lists', async () => {
      for (const path of ['/api/seller/orders', '/api/seller/earnings', '/api/seller/reviews', '/api/seller/listings']) await reversed(path, hub);
    });

    it('keeps sorting by name where that is the natural order', async () => {
      const byName = await t.api('/api/staff/sellers?sort=name', { token: admin });
      const names = byName.json.items.map((s) => s.displayName);
      assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
      assert.equal((await t.api('/api/staff/listings?sort=name', { token: admin })).status, 200);
      const products = (await t.api('/api/staff/products?limit=200', { token: admin })).json.items; // the catalog's own order: brand, then name
      assert.deepEqual(products.map((p) => p.id), (await t.api('/api/staff/products?limit=200&sort=name', { token: admin })).json.items.map((p) => p.id));
      assert.equal((await t.api('/api/seller/listings?sort=name', { token: hub })).status, 200);
    });

    it('defaults to newest first, and rejects anything else', async () => {
      const plain = await ids('/api/staff/orders', admin);
      const newest = (await both('/api/staff/orders', admin))[0];
      assert.deepEqual(plain, newest);
      for (const path of ['/api/staff/orders', '/api/staff/users', '/api/staff/payouts', '/api/staff/earnings', '/api/staff/audit', '/api/staff/sellers', '/api/staff/listings', '/api/staff/products', '/api/staff/tickets', '/api/staff/support']) {
        assert.equal((await t.api(`${path}?sort=sideways`, { token: support })).status, 400, path);
      }
      for (const path of ['/api/seller/orders', '/api/seller/earnings', '/api/seller/reviews', '/api/seller/listings', '/api/seller/support']) {
        assert.equal((await t.api(`${path}?sort=sideways`, { token: hub })).status, 400, path);
      }
    });

    it('still combines with the other filters', async () => {
      const [newest, oldest] = await both(`/api/staff/orders?sellerId=${hubId}`, admin);
      assert.ok(newest.length >= 3);
      assert.deepEqual(oldest, [...newest].reverse());
      const [n2, o2] = await both('/api/staff/orders?status=placed&q=TSM', admin);
      assert.deepEqual(o2, [...n2].reverse());
    });

    it('swaps rows saved in the very same instant too (like the demo seed data), so Oldest is always the mirror of Newest', async () => {
      await pool.query("UPDATE products SET created_at = '2026-01-01 00:00:00.000'");
      await pool.query("UPDATE users SET created_at = '2026-01-01 00:00:00.000'");
      await pool.query("UPDATE listings SET created_at = '2026-01-01 00:00:00.000'");
      await pool.query("UPDATE orders SET created_at = '2026-01-01 00:00:00.000'");
      for (const path of ['/api/staff/products', '/api/staff/users', '/api/staff/listings', '/api/staff/orders']) await reversed(path, admin);
      for (const path of ['/api/seller/listings', '/api/seller/orders']) await reversed(path, hub);
    });
  });
});
