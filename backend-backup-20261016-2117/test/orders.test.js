import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';
import { auditCount, looseOffer, newUser, offer, readyProducts, setAddress } from './v4-helpers.js';

describe('buying: checkout, box numbers and fees', () => {
  let t;
  let admin;
  let seller; // seller@tsm.test
  let hub; // hub@tsm.test
  let sellerId;
  let hubId;
  let buyer; // has a shipping address
  let products;
  let caseOffer; // seller's case offer, starts at Box 4 of 12
  let hubLoose; // hub's loose offer

  const buy = (token, items) => t.api('/api/orders', { method: 'POST', token, body: { items } });
  const mine = async (token, id) => (await t.api(`/api/seller/listings/${id}`, { token })).json;
  const labels = (r) => r.json.orders.flatMap((o) => o.items.map((i) => i.boxLabel));

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    seller = await t.login('seller@tsm.test', DEMO_PASSWORD);
    hub = await t.login('hub@tsm.test', DEMO_PASSWORD);
    sellerId = (await t.api('/api/seller/me', { token: seller })).json.id;
    hubId = (await t.api('/api/seller/me', { token: hub })).json.id;
    products = await readyProducts(t, admin, 3);
    await pool.query('DELETE FROM listings'); // start from a clean shop: every offer below is made here
    buyer = await newUser(t, 'buyer', { address: true });
    caseOffer = await offer(t, seller, products[0]); // Box 4 of 12, $100.00, 6 in stock
    hubLoose = await looseOffer(t, hub, products[0]); // $50.00, 20 in stock
  });
  after(() => t.stop());

  describe('who can check out', () => {
    it('needs a signed-in person', async () => {
      const r = await t.api('/api/orders', { method: 'POST', body: { items: [{ listingId: caseOffer.id, quantity: 1 }] } });
      assert.equal(r.status, 401);
      assert.equal((await t.api('/api/orders')).status, 401);
    });

    it('asks for a shipping address first', async () => {
      const noAddress = await newUser(t, 'noaddr');
      const r = await buy(noAddress.token, [{ listingId: caseOffer.id, quantity: 1 }]);
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'address_required');
      assert.equal((await mine(seller, caseOffer.id)).boxPosition, 'Box 4 of 12'); // nothing was taken
    });

    it('checks the cart', async () => {
      assert.equal((await buy(buyer.token, [])).status, 400);
      assert.equal((await buy(buyer.token, [{ listingId: 'nope', quantity: 1 }])).status, 400);
      assert.equal((await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 0 }])).status, 400);
      assert.equal((await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 100 }])).status, 400);
      assert.equal((await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 1.5 }])).status, 400);
      const gone = await buy(buyer.token, [{ listingId: randomUUID(), quantity: 1 }]);
      assert.equal(gone.status, 409);
      assert.equal(gone.json.error.code, 'unavailable');
    });

    it("won't let a seller buy their own offer", async () => {
      await setAddress(t, seller);
      const r = await buy(seller, [{ listingId: caseOffer.id, quantity: 1 }]);
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'own_listing');
    });
  });

  // Spec item 1: every purchase moves a case offer on to the next box. These run in order on the same offer.
  describe('a case offer hands out a new box every time', () => {
    it('sells Box 4, then the offer says Box 5', async () => {
      const r = await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 1 }]);
      assert.equal(r.status, 201);
      assert.equal(r.json.orders.length, 1);
      const order = r.json.orders[0];
      assert.equal(order.status, 'placed');
      assert.match(order.orderNumber, /^TSM-[A-Z0-9]{8}$/);
      assert.equal(order.subtotalCents, 10000);
      assert.equal(order.seller.id, sellerId);
      assert.equal(order.shippingAddress.city, 'Austin');
      assert.equal(order.shippingAddress.line1, '12 Pack Rat Lane');
      assert.equal(order.buyer, undefined); // a buyer does not need their own name sent back
      const item = order.items[0];
      assert.equal(item.boxLabel, 'Box 4 of 12');
      assert.equal(item.boxFirst, 4);
      assert.equal(item.boxLast, 4);
      assert.equal(item.boxesInCase, 12);
      assert.equal(item.unitPriceCents, 10000);
      assert.equal(item.distributor, 'Card Depot');

      const now = await mine(seller, caseOffer.id);
      assert.equal(now.boxPosition, 'Box 5 of 12');
      assert.equal(now.boxNumber, 5);
      assert.equal(now.quantityAvailable, 5);
      // The shop shows the new box number to the next person.
      const shop = await t.api(`/api/products/${products[0]}`);
      const shown = shop.json.listings.find((l) => l.id === caseOffer.id);
      assert.equal(shown.boxPosition, 'Box 5 of 12');
    });

    it('sells Box 5 to the next buyer, so nobody gets the same box twice', async () => {
      const other = await newUser(t, 'second', { address: true });
      const r = await buy(other.token, [{ listingId: caseOffer.id, quantity: 1 }]);
      assert.equal(r.status, 201);
      assert.deepEqual(labels(r), ['Box 5 of 12']);
      assert.equal((await mine(seller, caseOffer.id)).boxPosition, 'Box 6 of 12');
    });

    it('gives several boxes at once when buying several (Boxes 6-7)', async () => {
      const r = await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 2 }]);
      assert.equal(r.status, 201);
      assert.deepEqual(labels(r), ['Boxes 6–7 of 12']);
      assert.equal(r.json.orders[0].items[0].boxFirst, 6);
      assert.equal(r.json.orders[0].items[0].boxLast, 7);
      assert.equal(r.json.orders[0].subtotalCents, 20000);
      const now = await mine(seller, caseOffer.id);
      assert.equal(now.boxPosition, 'Box 8 of 12');
      assert.equal(now.quantityAvailable, 2);
    });

    it('refuses more than is left, and leaves the offer alone', async () => {
      const r = await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 3 }]);
      assert.equal(r.status, 409);
      assert.equal(r.json.error.code, 'unavailable');
      const now = await mine(seller, caseOffer.id);
      assert.equal(now.boxPosition, 'Box 8 of 12');
      assert.equal(now.quantityAvailable, 2);
    });

    it('sells out when the stock is gone, even with boxes left in the case', async () => {
      const r = await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 2 }]);
      assert.deepEqual(labels(r), ['Boxes 8–9 of 12']);
      const now = await mine(seller, caseOffer.id);
      assert.equal(now.boxPosition, 'Box 10 of 12');
      assert.equal(now.quantityAvailable, 0);
      assert.equal(now.status, 'sold_out');
      assert.equal((await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 1 }])).status, 409);
    });

    it('lets the seller restock the rest of the case, and the last box finishes it', async () => {
      assert.equal((await t.api(`/api/seller/listings/${caseOffer.id}`, { method: 'PATCH', token: seller, body: { quantityAvailable: 4 } })).status, 400); // only 3 boxes are left
      assert.equal((await t.api(`/api/seller/listings/${caseOffer.id}`, { method: 'PATCH', token: seller, body: { quantityAvailable: 3 } })).status, 200);
      const r = await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 3 }]);
      assert.equal(r.status, 201);
      assert.deepEqual(labels(r), ['Boxes 10–12 of 12']);
      const now = await mine(seller, caseOffer.id);
      assert.equal(now.boxNumber, 12); // never goes past the end of the case
      assert.equal(now.boxPosition, 'Box 12 of 12');
      assert.equal(now.quantityAvailable, 0);
      assert.equal(now.status, 'sold_out');
      assert.equal((await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 1 }])).status, 409);
    });

    it('starts again when the seller opens a new case', async () => {
      const r = await t.api(`/api/seller/listings/${caseOffer.id}`, { method: 'PATCH', token: seller, body: { boxNumber: 1, boxesInCase: 12, quantityAvailable: 5 } });
      assert.equal(r.status, 200);
      assert.equal(r.json.boxPosition, 'Box 1 of 12');
      const bought = await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 1 }]);
      assert.deepEqual(labels(bought), ['Box 1 of 12']);
    });

    it('never hands the same box to two buyers checking out at the same moment', async () => {
      const racing = await offer(t, hub, products[1], { boxNumber: 1, boxesInCase: 12, quantityAvailable: 8 });
      const results = await Promise.all(Array.from({ length: 6 }, () => buy(buyer.token, [{ listingId: racing.id, quantity: 1 }])));
      assert.deepEqual(results.map((r) => r.status), [201, 201, 201, 201, 201, 201]);
      const got = results.flatMap(labels).sort();
      assert.deepEqual(got, ['Box 1 of 12', 'Box 2 of 12', 'Box 3 of 12', 'Box 4 of 12', 'Box 5 of 12', 'Box 6 of 12']);
      const now = await mine(hub, racing.id);
      assert.equal(now.boxPosition, 'Box 7 of 12');
      assert.equal(now.quantityAvailable, 2);
    });

    it('also copes with shoppers buying different offers from one seller at the same moment', async () => {
      const one = await looseOffer(t, hub, products[1], { quantityAvailable: 10 });
      const two = await looseOffer(t, hub, products[2], { quantityAvailable: 10 });
      const shoppers = await Promise.all([1, 2, 3].map((n) => newUser(t, `rush${n}`, { address: true })));
      const results = await Promise.all(
        shoppers.flatMap((s) => [buy(s.token, [{ listingId: one.id, quantity: 1 }]), buy(s.token, [{ listingId: two.id, quantity: 2 }])]),
      );
      assert.deepEqual(results.map((r) => r.status), [201, 201, 201, 201, 201, 201]);
      assert.equal((await mine(hub, one.id)).quantityAvailable, 7);
      assert.equal((await mine(hub, two.id)).quantityAvailable, 4);
    });

    it('treats the same offer twice in the cart as one line', async () => {
      const mixed = await offer(t, seller, products[2], { boxNumber: 1, boxesInCase: 12, quantityAvailable: 6 });
      const r = await buy(buyer.token, [{ listingId: mixed.id, quantity: 1 }, { listingId: mixed.id, quantity: 1 }]);
      assert.equal(r.status, 201);
      assert.equal(r.json.orders[0].items.length, 1);
      assert.deepEqual(labels(r), ['Boxes 1–2 of 12']);
    });
  });

  describe('orders, sellers and stock', () => {
    it('makes one order per seller from a single checkout', async () => {
      const a = await offer(t, seller, products[1], { boxNumber: 1, boxesInCase: 12, quantityAvailable: 3 });
      const r = await buy(buyer.token, [{ listingId: a.id, quantity: 1 }, { listingId: hubLoose.id, quantity: 2 }]);
      assert.equal(r.status, 201);
      assert.equal(r.json.orders.length, 2);
      assert.equal(r.json.orders[0].checkoutId, r.json.orders[1].checkoutId);
      assert.deepEqual(r.json.orders.map((o) => o.seller.id).sort(), [sellerId, hubId].sort());
      const hubOrder = r.json.orders.find((o) => o.seller.id === hubId);
      assert.equal(hubOrder.subtotalCents, 10000); // 2 x $50.00
      assert.equal(hubOrder.items[0].boxLabel, null); // loose product has no box
    });

    it('is all or nothing: one bad line cancels the whole checkout', async () => {
      const was = await mine(seller, caseOffer.id);
      assert.ok(was.quantityAvailable >= 1);
      const [[{ n: ordersBefore }]] = await pool.query('SELECT COUNT(*) AS n FROM orders');
      const r = await buy(buyer.token, [{ listingId: caseOffer.id, quantity: 1 }, { listingId: hubLoose.id, quantity: 99 }]);
      assert.equal(r.status, 409);
      const [[{ n: ordersAfter }]] = await pool.query('SELECT COUNT(*) AS n FROM orders');
      assert.equal(ordersAfter, ordersBefore);
      const now = await mine(seller, caseOffer.id);
      assert.equal(now.boxPosition, was.boxPosition);
      assert.equal(now.quantityAvailable, was.quantityAvailable);
    });

    it('does not sell an offer staff put on hold, until they release it', async () => {
      const hold = await t.api(`/api/staff/listings/${hubLoose.id}/hold`, { method: 'POST', token: admin, body: { reason: 'Photo mismatch' } });
      assert.equal(hold.status, 200);
      assert.equal((await buy(buyer.token, [{ listingId: hubLoose.id, quantity: 1 }])).status, 409);
      assert.equal((await t.api(`/api/staff/listings/${hubLoose.id}/release`, { method: 'POST', token: admin, body: {} })).status, 200);
      assert.equal((await buy(buyer.token, [{ listingId: hubLoose.id, quantity: 1 }])).status, 201);
    });

    it('does not sell from a seller whose selling was revoked', async () => {
      const lonely = await offer(t, hub, products[2], { boxNumber: 1, boxesInCase: 12, quantityAvailable: 2 });
      assert.equal((await t.api(`/api/staff/sellers/${hubId}/revoke`, { method: 'POST', token: admin, body: { reason: 'Testing checkout' } })).status, 200);
      assert.equal((await buy(buyer.token, [{ listingId: lonely.id, quantity: 1 }])).status, 409);
      assert.equal((await t.api(`/api/staff/sellers/${hubId}/reinstate`, { method: 'POST', token: admin, body: {} })).status, 200);
      assert.equal((await buy(buyer.token, [{ listingId: lonely.id, quantity: 1 }])).status, 201);
    });

    it('lists only my own orders, newest first, with paging', async () => {
      const mineList = await t.api('/api/orders?limit=2', { token: buyer.token });
      assert.equal(mineList.status, 200);
      assert.equal(mineList.json.items.length, 2);
      assert.ok(mineList.json.total > 2);
      const times = mineList.json.items.map((o) => o.createdAt);
      assert.ok(times[0] >= times[1]);
      const stranger = await newUser(t, 'stranger');
      const theirs = await t.api('/api/orders', { token: stranger.token });
      assert.deepEqual(theirs.json.items, []);
      assert.equal(theirs.json.total, 0);
      assert.equal((await t.api(`/api/orders/${mineList.json.items[0].id}`, { token: stranger.token })).status, 404);
      assert.equal((await t.api('/api/orders/not-an-id', { token: buyer.token })).status, 404);
    });
  });

  describe('the money split on each sale', () => {
    let stock;
    let firstOrderNumber;
    const earningFor = async (orderNumber) => (await pool.query('SELECT * FROM seller_earnings WHERE order_ref = ?', [orderNumber]))[0];
    const salesCount = async () => Number((await pool.query('SELECT sales_count FROM seller_profiles WHERE user_id = ?', [sellerId]))[0][0].sales_count);

    before(async () => {
      stock = await looseOffer(t, seller, products[2], { priceCents: 10000, quantityAvailable: 30 });
    });

    it('takes a flat 5% for TSM by default and nothing else', async () => {
      const salesBefore = await salesCount();
      const r = await buy(buyer.token, [{ listingId: stock.id, quantity: 2 }]);
      assert.equal(r.status, 201);
      firstOrderNumber = r.json.orders[0].orderNumber;
      const rows = await earningFor(firstOrderNumber);
      assert.equal(rows.length, 1);
      const e = rows[0];
      assert.equal(e.gross_cents, 20000);
      assert.equal(e.commission_bps, 500);
      assert.equal(e.commission_cents, 1000);
      assert.equal(e.processing_fee_bps, 0);
      assert.equal(e.processing_fee_cents, 0);
      assert.equal(e.net_cents, 19000);
      assert.equal(e.status, 'available');
      assert.equal(await salesCount(), salesBefore + 2);
    });

    it('takes the payment (Apple) fee an admin set, and remembers the rates each sale was made at', async () => {
      const before = await t.api('/api/staff/settings', { token: admin });
      assert.equal(before.json.fees.tsmFeeBps, 500);
      assert.equal(before.json.fees.processingFeeBps, 0);
      assert.equal(before.json.fees.totalBps, 500);
      const set = await t.api('/api/staff/settings/fees', { method: 'PUT', token: admin, body: { processingFeeBps: 290 } });
      assert.equal(set.status, 200);
      assert.equal(set.json.fees.processingFeeBps, 290);
      assert.equal(set.json.fees.totalBps, 790);

      const r = await buy(buyer.token, [{ listingId: stock.id, quantity: 1 }]);
      const [e] = await earningFor(r.json.orders[0].orderNumber);
      assert.equal(e.gross_cents, 10000);
      assert.equal(e.commission_cents, 500);
      assert.equal(e.processing_fee_bps, 290);
      assert.equal(e.processing_fee_cents, 290);
      assert.equal(e.net_cents, 9210);

      // The seller sees the same rates, and the old sale still shows the rates it was made at.
      const earnings = await t.api('/api/seller/earnings', { token: seller });
      assert.deepEqual(earnings.json.fees, { tsmFeeBps: 500, processingFeeBps: 290, totalBps: 790 });
      const [old] = await earningFor(firstOrderNumber);
      assert.equal(old.processing_fee_cents, 0);
      assert.equal(old.net_cents, 19000);
    });

    it('lets an admin change TSM’s own cut too, and records who did it', async () => {
      const set = await t.api('/api/staff/settings/fees', { method: 'PUT', token: admin, body: { tsmFeeBps: 600, processingFeeBps: 0 } });
      assert.equal(set.status, 200);
      assert.equal(set.json.fees.tsmFeeBps, 600);
      assert.equal(set.json.fees.updatedBy, 'TSM Admin');
      const r = await buy(buyer.token, [{ listingId: stock.id, quantity: 1 }]);
      const [e] = await earningFor(r.json.orders[0].orderNumber);
      assert.equal(e.commission_cents, 600);
      assert.equal(e.net_cents, 9400);
      assert.equal(await auditCount('settings.fees_updated'), 2);
    });
  });
});
