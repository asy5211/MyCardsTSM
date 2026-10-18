import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';
import { auditCount, looseOffer, newUser, readyProducts } from './v4-helpers.js';

describe('v5: support goes to the seller, staff keep access and can take over', () => {
  let t;
  let admin;
  let support; // staff, read + answer only
  let hub;
  let hubId;
  let seller;
  let sellerId;
  let buyer;
  let other; // another customer
  let hubOrder;
  let sellerOrder;
  let request; // the buyer's request about the hub order

  const ask = (token, body) => t.api('/api/support', { method: 'POST', token, body });
  const staffGet = (path, token = support) => t.api(`/api/staff/support${path}`, { token });
  const staffPost = (path, body = {}, token = support) => t.api(`/api/staff/support/${path}`, { method: 'POST', token, body });
  const sellerGet = (path = '', token = hub) => t.api(`/api/seller/support${path}`, { token });
  const sellerPost = (path, body = {}, token = hub) => t.api(`/api/seller/support/${path}`, { method: 'POST', token, body });
  const buyerView = async () => (await t.api(`/api/support/${request.id}`, { token: buyer.token })).json;

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
    const products = await readyProducts(t, admin, 2);
    await pool.query('DELETE FROM listings');
    buyer = await newUser(t, 'buyer', { address: true });
    other = await newUser(t, 'other');
    const a = await looseOffer(t, hub, products[0], { priceCents: 5000 });
    const b = await looseOffer(t, seller, products[1], { priceCents: 3000 });
    const placed = await t.api('/api/orders', { method: 'POST', token: buyer.token, body: { items: [{ listingId: a.id, quantity: 1 }, { listingId: b.id, quantity: 1 }] } });
    assert.equal(placed.status, 201);
    hubOrder = placed.json.orders.find((o) => o.seller.id === hubId);
    sellerOrder = placed.json.orders.find((o) => o.seller.id === sellerId);
  });
  after(() => t.stop());

  describe('sending a request', () => {
    it("sends a request about an order to that order's seller", async () => {
      const r = await ask(buyer.token, { topic: 'other', subject: 'Box arrived dented', message: 'The corner of the box was crushed when it arrived.', orderId: hubOrder.id });
      assert.equal(r.status, 201);
      request = r.json.request;
      assert.equal(request.topic, 'order'); // an order request is always an order request
      assert.equal(request.orderId, hubOrder.id);
      assert.equal(request.orderNumber, hubOrder.orderNumber);
      assert.equal(request.seller.id, hubId);
      assert.equal(request.seller.displayName, 'Collector Hub');
      assert.equal(request.handler, 'seller');
      assert.equal(request.status, 'open');
      assert.equal(await auditCount('support.requested', request.id), 1);
    });

    it('only accepts the buyer’s own orders, and not from guests', async () => {
      const message = 'This is about an order that is not mine at all.';
      assert.equal((await ask(other.token, { topic: 'order', subject: 'Not mine', message, orderId: hubOrder.id })).status, 404);
      assert.equal((await ask(other.token, { topic: 'order', subject: 'Nothing', message, orderId: randomUUID() })).status, 404);
      assert.equal((await ask(other.token, { topic: 'order', subject: 'Bad id', message, orderId: 'not-an-id' })).status, 400);
      const guest = await ask(undefined, { name: 'Guest Person', email: 'guest@example.com', topic: 'order', subject: 'Guest order', message, orderId: hubOrder.id });
      assert.equal(guest.status, 400);
    });

    it('keeps every request without an order with TSM', async () => {
      const r = await ask(buyer.token, { topic: 'account', subject: 'Change my email', message: 'Please help me change the email on my account.' });
      assert.equal(r.status, 201);
      assert.equal(r.json.request.seller, null);
      assert.equal(r.json.request.handler, 'tsm');
      const guest = await ask(undefined, { name: 'Guest Person', email: 'guest@example.com', topic: 'other', subject: 'Forgot password', message: 'I can not log in to my account anymore.' });
      assert.equal(guest.json.request.handler, 'tsm');
    });

    it("keeps a request about TSM's own store with TSM", async () => {
      const product = (await readyProducts(t, admin, 1))[0];
      const featured = await t.api('/api/staff/featured/listings', {
        method: 'POST', token: admin,
        body: { productId: product, priceCents: 7000, quantityAvailable: 3, sourceType: 'distributor', distributor: 'TSM Warehouse', packaging: 'loose' },
      });
      assert.equal(featured.status, 201);
      const placed = await t.api('/api/orders', { method: 'POST', token: buyer.token, body: { items: [{ listingId: featured.json.id, quantity: 1 }] } });
      const r = await ask(buyer.token, { topic: 'order', subject: 'Where is it', message: 'I would like an update on my order please.', orderId: placed.json.orders[0].id });
      assert.equal(r.status, 201);
      assert.equal(r.json.request.handler, 'tsm');
      assert.equal(r.json.request.seller.isTsm, true);
      assert.equal(r.json.request.orderNumber, placed.json.orders[0].orderNumber);
    });
  });

  describe("in the seller's dashboard", () => {
    it('lists only the requests about my own orders, and shows the buyer’s username but never their email', async () => {
      const list = await sellerGet();
      assert.equal(list.status, 200);
      assert.equal(list.json.total, 1);
      assert.equal(list.json.counts.open, 1);
      const item = list.json.items[0];
      assert.equal(item.id, request.id);
      assert.equal(item.buyer.username, buyer.username);
      assert.equal(item.orderNumber, hubOrder.orderNumber);
      assert.equal(item.handler, 'seller');
      assert.ok(!JSON.stringify(list.json).includes(buyer.email));
      assert.equal((await sellerGet('', seller)).json.total, 0); // the other seller sees nothing
      assert.equal((await sellerGet(`/${request.id}`, seller)).status, 404);
      assert.equal((await sellerGet('/not-a-uuid')).status, 404);
    });

    it('is only for sellers', async () => {
      assert.equal((await sellerGet('', null)).status, 401);
      assert.equal((await sellerGet('', buyer.token)).status, 403);
    });

    it('shows the conversation and counts it on the dashboard', async () => {
      const r = await sellerGet(`/${request.id}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.messages.length, 1);
      assert.equal(r.json.messages[0].senderType, 'user');
      assert.equal(r.json.messages[0].mine, false);
      assert.equal((await t.api('/api/seller/dashboard', { token: hub })).json.supportToAnswer, 1);
    });

    it('lets the seller answer; the buyer sees the answer from the seller', async () => {
      assert.equal((await sellerPost(`${request.id}/messages`, { body: '' })).status, 400);
      assert.equal((await sellerPost(`${request.id}/messages`, { body: 'Sorry about that. I will send a replacement.' }, seller)).status, 404);
      const r = await sellerPost(`${request.id}/messages`, { body: 'Sorry about that. I will send a replacement.' });
      assert.equal(r.status, 201);
      assert.equal(r.json.mine, true);
      const seen = await buyerView();
      assert.equal(seen.request.status, 'answered');
      assert.equal(seen.messages.at(-1).senderType, 'seller');
      assert.equal(seen.messages.at(-1).senderName, 'Collector Hub');
      assert.equal(seen.messages.at(-1).mine, false);
      assert.equal((await t.api('/api/seller/dashboard', { token: hub })).json.supportToAnswer, 0);
      assert.equal(await auditCount('support.answered_by_seller', request.id), 1);
    });

    it('comes back as open when the buyer writes again', async () => {
      const r = await t.api(`/api/support/${request.id}/messages`, { method: 'POST', token: buyer.token, body: { body: 'Thank you, how long will it take?' } });
      assert.equal(r.status, 201);
      assert.equal((await sellerGet(`/${request.id}`)).json.request.status, 'open');
      assert.equal((await t.api('/api/seller/dashboard', { token: hub })).json.supportToAnswer, 1);
    });

    it('can be closed and reopened by the seller; a closed request takes no reply', async () => {
      assert.equal((await sellerPost(`${request.id}/status`, { status: 'nope' })).status, 400);
      assert.equal((await sellerPost(`${request.id}/status`, { status: 'closed' })).json.request.status, 'closed');
      assert.equal((await sellerPost(`${request.id}/messages`, { body: 'Anything else?' })).status, 409);
      assert.equal((await sellerPost(`${request.id}/status`, { status: 'open' })).json.request.status, 'open');
    });

    it('filters by status and searches by order number', async () => {
      assert.equal((await sellerGet('?status=answered')).json.total, 0);
      assert.equal((await sellerGet('?status=open')).json.total, 1);
      assert.equal((await sellerGet(`?q=${hubOrder.orderNumber}`)).json.total, 1);
      assert.equal((await sellerGet('?q=ZZZZZZ')).json.total, 0);
      assert.equal((await sellerGet('?status=bogus')).status, 400);
      for (const sort of ['newest', 'oldest']) assert.equal((await sellerGet(`?sort=${sort}`)).status, 200);
      assert.equal((await sellerGet('?sort=sideways')).status, 400);
    });

    it("can search the buyer's username but never their email or real name", async () => {
      assert.equal((await sellerGet(`?q=${buyer.username}`)).json.total, 1);
      assert.equal((await sellerGet(`?q=${encodeURIComponent(buyer.email)}`)).json.total, 0);
      assert.equal((await sellerGet('?q=example.com')).json.total, 0);
      // Staff can search by email, as before.
      assert.equal((await staffGet(`?q=${encodeURIComponent(buyer.email)}`)).json.total >= 1, true);
    });
  });

  describe('staff keep access and can override', () => {
    it('sees the request with its seller, order and who is answering', async () => {
      const r = await staffGet(`/${request.id}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.request.seller.displayName, 'Collector Hub');
      assert.equal(r.json.request.orderNumber, hubOrder.orderNumber);
      assert.equal(r.json.request.handler, 'seller');
      assert.equal(r.json.request.email, buyer.email); // staff see the buyer's contact details
      assert.ok(r.json.messages.some((m) => m.senderType === 'seller'));
    });

    it('can answer a request even while it is with the seller', async () => {
      const r = await staffPost(`${request.id}/messages`, { body: 'This is TSM support. We are following this up too.' });
      assert.equal(r.status, 201);
      assert.equal((await sellerGet(`/${request.id}`)).json.messages.at(-1).senderType, 'staff');
      await sellerPost(`${request.id}/status`, { status: 'open' }); // put it back for the next steps
      await t.api(`/api/support/${request.id}/messages`, { method: 'POST', token: buyer.token, body: { body: 'Still waiting, please.' } });
    });

    it('filters the list by seller with the same search used for orders', async () => {
      const found = await t.api('/api/staff/seller-search?q=Collector', { token: support });
      assert.equal(found.json.items[0].id, hubId);
      const mine = await staffGet(`?sellerId=${hubId}`);
      assert.equal(mine.json.total, 1);
      assert.equal(mine.json.items[0].id, request.id);
      assert.equal(mine.json.counts.open, 1); // tab counts follow the seller
      const none = await staffGet(`?sellerId=${sellerId}`);
      assert.equal(none.json.total, 0);
      assert.equal(none.json.counts.open, 0);
      assert.equal((await staffGet('')).json.total >= 4, true);
      assert.equal((await staffGet('?sellerId=not-a-uuid')).status, 400);
    });

    it('filters by who is handling it, and searches by seller name or order number', async () => {
      assert.equal((await staffGet('?handler=seller')).json.total, 1);
      const tsm = await staffGet('?handler=tsm');
      assert.ok(tsm.json.total >= 3);
      assert.ok(tsm.json.items.every((i) => i.handler === 'tsm'));
      assert.equal((await staffGet('?q=Collector Hub')).json.total, 1);
      assert.equal((await staffGet(`?q=${hubOrder.orderNumber}`)).json.total, 1);
      assert.equal((await staffGet('?handler=nobody')).status, 400);
    });

    it('sorts newest first or oldest first', async () => {
      await pool.query("UPDATE support_requests SET updated_at = NOW(3) - INTERVAL 5 DAY WHERE id <> ?", [request.id]);
      const newest = (await staffGet('?status=all&sort=newest')).json.items.map((i) => i.id);
      const oldest = (await staffGet('?status=all&sort=oldest')).json.items.map((i) => i.id);
      assert.equal(newest.length, oldest.length);
      // open requests are always listed first; inside the same status the order follows the sort
      assert.equal(newest[0], request.id);
      assert.notDeepEqual(newest, oldest);
      assert.equal((await staffGet('?sort=sideways')).status, 400);
    });

    it('takes a request over: the seller can still read it but not reply', async () => {
      const r = await staffPost(`${request.id}/take-over`);
      assert.equal(r.status, 200);
      assert.equal(r.json.request.handler, 'tsm');
      assert.equal(r.json.request.takenOverBy, 'Sam Support');
      assert.ok(r.json.request.takenOverAt);
      assert.match(r.json.messages.at(-1).body, /TSM support has taken over/);
      assert.equal(r.json.messages.at(-1).senderType, 'system');

      const seen = await sellerGet(`/${request.id}`);
      assert.equal(seen.status, 200);
      assert.equal(seen.json.request.handler, 'tsm');
      const reply = await sellerPost(`${request.id}/messages`, { body: 'Can I still answer?' });
      assert.equal(reply.status, 409);
      assert.match(reply.json.error.message, /taken over/);
      assert.equal((await sellerPost(`${request.id}/status`, { status: 'closed' })).status, 409);
      assert.equal((await t.api('/api/seller/dashboard', { token: hub })).json.supportToAnswer, 0); // no longer the seller's to answer
      assert.equal(await auditCount('support.taken_over', request.id), 1);
      assert.equal((await staffGet('?handler=tsm')).json.items.some((i) => i.id === request.id), true);
    });

    it("can't be taken over twice, and a request that was never a seller's is already TSM's", async () => {
      assert.equal((await staffPost(`${request.id}/take-over`)).status, 409);
      const tsmOwn = (await staffGet('?handler=tsm')).json.items.find((i) => i.seller === null);
      assert.equal((await staffPost(`${tsmOwn.id}/take-over`)).status, 409);
      assert.equal((await staffPost(`${tsmOwn.id}/hand-back`)).status, 409);
      assert.equal((await staffPost(`${randomUUID()}/take-over`)).status, 404);
      assert.equal((await staffPost('nope/take-over')).status, 404);
    });

    it('keeps staff replying to the buyer after taking over', async () => {
      assert.equal((await staffPost(`${request.id}/messages`, { body: 'We will send a replacement today.' })).status, 201);
      const seen = (await buyerView()).request;
      assert.equal(seen.handler, 'tsm');
      assert.equal('takenOverBy' in seen, false, 'the buyer is never told which staff member took it over');
      const mine = await t.api('/api/support', { token: buyer.token });
      assert.equal(mine.json.items.some((r) => 'takenOverBy' in r), false);
    });

    it('hands it back, and the seller can reply again', async () => {
      const r = await staffPost(`${request.id}/hand-back`);
      assert.equal(r.status, 200);
      assert.equal(r.json.request.handler, 'seller');
      assert.equal(r.json.request.takenOverAt, null);
      assert.match(r.json.messages.at(-1).body, /handed this request back to Collector Hub/);
      assert.equal((await staffPost(`${request.id}/hand-back`)).status, 409);
      assert.equal((await sellerPost(`${request.id}/messages`, { body: 'Back with me. A replacement ships today.' })).status, 201);
      assert.equal(await auditCount('support.handed_back', request.id), 1);
    });

    it("lets staff close and reopen a seller's request", async () => {
      assert.equal((await staffPost(`${request.id}/status`, { status: 'closed' })).json.request.status, 'closed');
      assert.equal((await staffPost(`${request.id}/status`, { status: 'open' })).json.request.status, 'open');
    });

    it("also covers the other seller's request independently", async () => {
      const r = await ask(buyer.token, { topic: 'order', subject: 'Wrong item sent', message: 'I received a different pack than I ordered.', orderId: sellerOrder.id });
      assert.equal(r.json.request.seller.id, sellerId);
      assert.equal((await sellerGet('', seller)).json.total, 1);
      assert.equal((await sellerGet('')).json.total, 1); // hub still only sees its own
      assert.equal((await staffGet(`?sellerId=${sellerId}`)).json.total, 1);
    });
  });
});
