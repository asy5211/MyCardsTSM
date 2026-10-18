import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';
import { auditCount, looseOffer, newUser, readyProducts } from './v4-helpers.js';

describe('after the sale: shipping, tracking, chat, delivery and reviews', () => {
  let t;
  let admin;
  let seller;
  let hub;
  let hubId;
  let buyer;
  let order; // one hub order with two different items
  let products;

  const ship = (token, body, id = order.id) => t.api(`/api/seller/orders/${id}/ship`, { method: 'POST', token, body });
  const buyerOrder = async () => (await t.api(`/api/orders/${order.id}`, { token: buyer.token })).json;

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    seller = await t.login('seller@tsm.test', DEMO_PASSWORD);
    hub = await t.login('hub@tsm.test', DEMO_PASSWORD);
    hubId = (await t.api('/api/seller/me', { token: hub })).json.id;
    products = await readyProducts(t, admin, 2);
    await pool.query('DELETE FROM listings');
    buyer = await newUser(t, 'shopper', { address: true });
    const a = await looseOffer(t, hub, products[0], { priceCents: 5000 });
    const b = await looseOffer(t, hub, products[1], { priceCents: 3000 });
    const placed = await t.api('/api/orders', { method: 'POST', token: buyer.token, body: { items: [{ listingId: a.id, quantity: 1 }, { listingId: b.id, quantity: 2 }] } });
    assert.equal(placed.status, 201);
    order = placed.json.orders[0];
  });
  after(() => t.stop());

  describe('what the seller sees', () => {
    it('lists sold orders with who bought and where to ship', async () => {
      const r = await t.api('/api/seller/orders', { token: hub });
      assert.equal(r.status, 200);
      assert.equal(r.json.total, 1);
      assert.equal(r.json.counts.placed, 1);
      const o = r.json.items[0];
      assert.equal(o.id, order.id);
      assert.equal(o.buyer.username, buyer.username);
      assert.equal(o.shippingAddress.line1, '12 Pack Rat Lane');
      assert.equal(o.subtotalCents, 11000);
      assert.equal(o.items.length, 2);
    });

    it('filters by status and searches by order number', async () => {
      assert.equal((await t.api('/api/seller/orders?status=shipped', { token: hub })).json.total, 0);
      assert.equal((await t.api('/api/seller/orders?status=placed', { token: hub })).json.total, 1);
      assert.equal((await t.api(`/api/seller/orders?q=${order.orderNumber}`, { token: hub })).json.total, 1);
      assert.equal((await t.api('/api/seller/orders?q=ZZZZZZZZ', { token: hub })).json.total, 0);
      assert.equal((await t.api('/api/seller/orders?status=bogus', { token: hub })).status, 400);
    });

    it("keeps other sellers and ordinary customers out of someone else's sale", async () => {
      assert.equal((await t.api(`/api/seller/orders/${order.id}`, { token: seller })).status, 404);
      assert.equal((await t.api(`/api/seller/orders/${order.id}`, { token: hub })).status, 200);
      const r = await t.api('/api/seller/orders', { token: buyer.token });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'not_a_seller');
      assert.equal((await t.api(`/api/seller/orders/${order.id}/ship`, { method: 'POST', token: seller, body: { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' } })).status, 404);
    });
  });

  describe('shipping and tracking', () => {
    it("can't be marked received before it ships", async () => {
      assert.equal((await t.api(`/api/orders/${order.id}/delivered`, { method: 'POST', token: buyer.token, body: {} })).status, 409);
    });

    it('checks the carrier and tracking number', async () => {
      assert.equal((await ship(hub, { carrier: 'Pigeon', trackingNumber: '1Z999AA10123456784' })).status, 400);
      assert.equal((await ship(hub, { carrier: 'UPS', trackingNumber: '12' })).status, 400);
      assert.equal((await ship(hub, { carrier: 'UPS', trackingNumber: 'ab$cde123' })).status, 400);
      assert.equal((await ship(hub, { carrier: 'UPS' })).status, 400);
      assert.equal((await buyerOrder()).status, 'placed');
    });

    it('marks it shipped with a tracking link the buyer can open', async () => {
      const r = await ship(hub, { carrier: 'UPS', trackingNumber: '1Z 999 AA1 0123456784' });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'shipped');
      assert.equal(r.json.carrier, 'UPS');
      assert.equal(r.json.trackingNumber, '1Z999AA10123456784'); // spaces removed
      assert.equal(r.json.trackingUrl, 'https://www.ups.com/track?tracknum=1Z999AA10123456784');
      assert.ok(r.json.shippedAt);
      const seen = await buyerOrder();
      assert.equal(seen.status, 'shipped');
      assert.equal(seen.trackingUrl, 'https://www.ups.com/track?tracknum=1Z999AA10123456784');
      const chat = await t.api(`/api/orders/${order.id}/messages`, { token: buyer.token });
      assert.equal(chat.json.items.length, 1);
      assert.equal(chat.json.items[0].senderType, 'system');
      assert.equal(chat.json.items[0].kind, 'status');
      assert.equal(chat.json.items[0].mine, false);
      assert.match(chat.json.items[0].body, /^Shipped with UPS\. Tracking number: 1Z999AA10123456784$/);
      assert.equal(await auditCount('order.shipped', order.id), 1);
    });

    it('lets the seller correct the tracking number later without resetting the ship date', async () => {
      const first = await buyerOrder();
      const r = await ship(hub, { carrier: 'USPS', trackingNumber: '9400111899223197428490' });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'shipped');
      assert.equal(r.json.carrier, 'USPS');
      assert.equal(r.json.shippedAt, first.shippedAt);
      assert.match(r.json.trackingUrl, /^https:\/\/tools\.usps\.com\//);
      const chat = await t.api(`/api/orders/${order.id}/messages`, { token: buyer.token });
      assert.match(chat.json.items.at(-1).body, /^Tracking updated: USPS 9400111899223197428490$/);
      assert.equal(await auditCount('order.tracking_updated', order.id), 1);
    });

    it('gives no link for a carrier we cannot link to, but keeps the number', async () => {
      const r = await ship(hub, { carrier: 'Other', trackingNumber: 'LOCAL-COURIER-77' });
      assert.equal(r.json.trackingNumber, 'LOCAL-COURIER-77');
      assert.equal(r.json.trackingUrl, null);
      await ship(hub, { carrier: 'FedEx', trackingNumber: '794644790138' });
    });
  });

  describe('talking about the order', () => {
    it('lets the buyer and the seller write to each other', async () => {
      const q = await t.api(`/api/orders/${order.id}/messages`, { method: 'POST', token: buyer.token, body: { body: 'Is the box still sealed?' } });
      assert.equal(q.status, 201);
      assert.equal(q.json.mine, true);
      assert.equal(q.json.senderType, 'user');
      const a = await t.api(`/api/seller/orders/${order.id}/messages`, { method: 'POST', token: hub, body: { body: 'Yes, factory sealed.' } });
      assert.equal(a.status, 201);
      assert.equal(a.json.mine, true);
      assert.equal(a.json.senderType, 'seller');

      const sellerView = await t.api(`/api/seller/orders/${order.id}/messages`, { token: hub });
      const asked = sellerView.json.items.find((m) => m.body === 'Is the box still sealed?');
      assert.equal(asked.mine, false);
      assert.equal(asked.senderName, buyer.username);
      const buyerView = await t.api(`/api/orders/${order.id}/messages`, { token: buyer.token });
      assert.equal(buyerView.json.items.find((m) => m.body === 'Yes, factory sealed.').mine, false);
      // oldest first
      const ids = buyerView.json.items.map((m) => m.id);
      assert.deepEqual(ids, [...ids].sort((x, y) => x - y));
    });

    it('rejects empty messages and keeps strangers out of the chat', async () => {
      assert.equal((await t.api(`/api/orders/${order.id}/messages`, { method: 'POST', token: buyer.token, body: { body: '   ' } })).status, 400);
      assert.equal((await t.api(`/api/orders/${order.id}/messages`, { method: 'POST', token: buyer.token, body: { body: 'x'.repeat(2001) } })).status, 400);
      const stranger = await newUser(t, 'nosy');
      assert.equal((await t.api(`/api/orders/${order.id}/messages`, { token: stranger.token })).status, 404);
      assert.equal((await t.api(`/api/orders/${order.id}/messages`, { method: 'POST', token: stranger.token, body: { body: 'hi there' } })).status, 404);
      assert.equal((await t.api(`/api/seller/orders/${order.id}/messages`, { token: seller })).status, 404);
    });

    it('lets staff read orders and the chat, and logs that they looked', async () => {
      const list = await t.api(`/api/staff/orders?q=${order.orderNumber}`, { token: admin });
      assert.equal(list.status, 200);
      assert.equal(list.json.total, 1);
      assert.equal(list.json.items[0].buyer.username, buyer.username);
      assert.equal((await t.api(`/api/staff/orders?sellerId=${hubId}&status=shipped`, { token: admin })).json.total, 1);
      assert.equal((await t.api(`/api/staff/orders/${order.id}`, { token: admin })).json.orderNumber, order.orderNumber);
      const chat = await t.api(`/api/staff/orders/${order.id}/messages`, { token: admin });
      assert.equal(chat.status, 200);
      assert.ok(chat.json.items.length >= 3);
      assert.equal(await auditCount('staff.order_messages_viewed', order.id), 1);
      assert.equal((await t.api('/api/staff/orders', { token: buyer.token })).status, 401);
    });
  });

  describe('reviews and star ratings', () => {
    let reviewA;
    let reviewB;
    const itemFor = (productId) => order.items.find((i) => i.productId === productId);

    it('checks the rating and the item', async () => {
      const post = (itemId, body) => t.api(`/api/orders/${order.id}/items/${itemId}/review`, { method: 'POST', token: buyer.token, body });
      const itemA = itemFor(products[0]).id;
      for (const rating of [0, 6, 4.5, '5', null]) assert.equal((await post(itemA, { rating })).status, 400, String(rating));
      assert.equal((await post(itemA, { rating: 5, comment: 'x'.repeat(1001) })).status, 400);
      assert.equal((await post(randomUUID(), { rating: 5 })).status, 404);
      assert.equal((await t.api(`/api/orders/${order.id}/items/${itemA}/review`, { method: 'POST', token: seller, body: { rating: 5 } })).status, 404);
    });

    it('lets the buyer rate each item once', async () => {
      const a = await t.api(`/api/orders/${order.id}/items/${itemFor(products[0]).id}/review`, {
        method: 'POST', token: buyer.token, body: { rating: 5, comment: '  Fast shipping, sealed and clean.  ' },
      });
      assert.equal(a.status, 201);
      reviewA = a.json;
      assert.equal(a.json.rating, 5);
      assert.equal(a.json.comment, 'Fast shipping, sealed and clean.');
      assert.equal(a.json.reviewer, buyer.username);
      assert.equal(a.json.sellerResponse, null);
      assert.equal(a.json.orderNumber, order.orderNumber);

      const again = await t.api(`/api/orders/${order.id}/items/${itemFor(products[0]).id}/review`, { method: 'POST', token: buyer.token, body: { rating: 1 } });
      assert.equal(again.status, 409);

      const b = await t.api(`/api/orders/${order.id}/items/${itemFor(products[1]).id}/review`, { method: 'POST', token: buyer.token, body: { rating: 4 } });
      assert.equal(b.status, 201);
      assert.equal(b.json.comment, null);
      reviewB = b.json;
      // the order itself now shows each review
      const seen = await buyerOrder();
      assert.deepEqual(seen.items.map((i) => i.review.rating).sort(), [4, 5]);
    });

    it("updates the seller's star rating that app users see", async () => {
      const r = await t.api(`/api/sellers/${hubId}/reviews`); // public: no sign-in
      assert.equal(r.status, 200);
      assert.equal(r.json.summary.count, 2);
      assert.equal(r.json.summary.average, 4.5);
      assert.deepEqual(r.json.summary.distribution, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
      assert.equal(r.json.items.length, 2);
      assert.equal(r.json.seller.displayName, 'Collector Hub');
      const shop = await t.api(`/api/products/${products[0]}`);
      const offerNow = shop.json.listings.find((l) => l.seller.id === hubId);
      assert.equal(offerNow.seller.rating, 4.5);
      assert.equal(offerNow.seller.ratingCount, 2);
      assert.equal((await t.api(`/api/sellers/${randomUUID()}/reviews`)).status, 404);
    });

    it("shows one seller's reviews of one product (a review is about the seller, never the whole product)", async () => {
      // There is no product-wide list any more: you must say whose reviews you want.
      assert.equal((await t.api(`/api/products/${products[0]}/reviews`)).status, 400);
      const r = await t.api(`/api/products/${products[0]}/reviews?sellerId=${hubId}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.summary.count, 1);
      assert.equal(r.json.items[0].rating, 5);
      assert.equal(r.json.items[0].productName, r.json.product.name);
      assert.equal(r.json.seller.displayName, 'Collector Hub');
      // another seller selling the same product has none of those reviews
      const none = await t.api(`/api/products/${products[0]}/reviews?sellerId=${(await t.api('/api/seller/me', { token: seller })).json.id}`);
      assert.equal(none.json.summary.count, 0);
      assert.equal((await t.api(`/api/products/${products[0]}/reviews?sellerId=${randomUUID()}`)).status, 404);
    });

    it('lets the seller read their reviews by product and by stars', async () => {
      const all = await t.api('/api/seller/reviews', { token: hub });
      assert.equal(all.status, 200);
      assert.equal(all.json.total, 2);
      assert.equal(all.json.products.length, 2);
      assert.deepEqual(all.json.products.map((p) => p.count), [1, 1]);
      assert.equal(all.json.products.every((p) => p.unanswered === 1), true);
      const byProduct = await t.api(`/api/seller/reviews?productId=${products[1]}`, { token: hub });
      assert.deepEqual(byProduct.json.items.map((r) => r.rating), [4]);
      assert.equal((await t.api('/api/seller/reviews?rating=5', { token: hub })).json.total, 1);
      assert.equal((await t.api('/api/seller/reviews?answered=no', { token: hub })).json.total, 2);
      assert.equal((await t.api('/api/seller/reviews', { token: seller })).json.total, 0); // other sellers see only their own
    });

    it('lets the seller answer a review, and edit the answer', async () => {
      const respond = (token, id, response) => t.api(`/api/seller/reviews/${id}/respond`, { method: 'POST', token, body: { response } });
      assert.equal((await respond(hub, reviewA.id, 'x')).status, 400);
      assert.equal((await respond(seller, reviewA.id, 'Thank you for the kind words!')).status, 404); // not their review
      const ok = await respond(hub, reviewA.id, 'Thank you for the kind words!');
      assert.equal(ok.status, 200);
      assert.equal(ok.json.sellerResponse, 'Thank you for the kind words!');
      assert.ok(ok.json.sellerRespondedAt);
      assert.equal((await respond(hub, reviewA.id, 'Happy to help!')).json.sellerResponse, 'Happy to help!');
      assert.equal(await auditCount('review.responded', reviewA.id), 1);
      assert.equal(await auditCount('review.response_edited', reviewA.id), 1);

      const pub = await t.api(`/api/sellers/${hubId}/reviews`);
      const shown = pub.json.items.find((r) => r.id === reviewA.id);
      assert.equal(shown.sellerResponse, 'Happy to help!');
      assert.equal((await t.api('/api/seller/reviews?answered=yes', { token: hub })).json.total, 1);
      assert.equal((await t.api('/api/seller/reviews?answered=no', { token: hub })).json.items[0].id, reviewB.id);
    });
  });

  describe('receiving the order', () => {
    it('lets the buyer mark it received, once or many times', async () => {
      const r = await t.api(`/api/orders/${order.id}/delivered`, { method: 'POST', token: buyer.token, body: {} });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'delivered');
      assert.ok(r.json.deliveredAt);
      assert.equal((await t.api(`/api/orders/${order.id}/delivered`, { method: 'POST', token: buyer.token, body: {} })).json.status, 'delivered');
      assert.equal(await auditCount('order.delivered', order.id), 1);
      assert.equal((await t.api('/api/seller/orders', { token: hub })).json.counts.delivered, 1);
    });

    it('stops tracking changes once it is delivered', async () => {
      const r = await ship(hub, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });
      assert.equal(r.status, 409);
    });
  });
});
