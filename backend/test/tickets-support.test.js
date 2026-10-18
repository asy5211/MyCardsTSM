import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';
import { auditCount, newUser } from './v4-helpers.js';

describe('sell-to-us tickets: staff review, price offers, accept / counter / decline', () => {
  let t;
  let admin;
  let support;
  let seller; // seller@tsm.test
  let hub; // hub@tsm.test
  let buyer; // not a seller

  const items = [
    { productName: 'Crimson Storm Booster Box', quantity: 10, source: 'Case from distributor', minPricePerItemCents: 11000 },
    { productName: 'Standard Pack', quantity: 40, source: 'Retail', minPricePerItemCents: 300 },
  ];
  const create = (token = seller, body = { items }) => t.api('/api/sell-tickets', { method: 'POST', token, body });
  const mineOf = (id, token = seller) => t.api(`/api/sell-tickets/${id}`, { token });
  const staff = (path, body, token = admin) => t.api(`/api/staff/tickets/${path}`, { method: 'POST', token, body: body ?? {} });
  const ticket = async () => {
    const r = await create();
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json;
  };

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    await pool.query(
      "INSERT INTO admin_staff (id, email, name, password_hash, role) VALUES (UUID(), 'support@tsm.test', 'Sam Support', ?, 'support')",
      [await hashPassword('SupportPass1!')],
    );
    support = await t.staffLogin('support@tsm.test', 'SupportPass1!');
    seller = await t.login('seller@tsm.test', DEMO_PASSWORD);
    hub = await t.login('hub@tsm.test', DEMO_PASSWORD);
    buyer = await newUser(t, 'buyer');
  });
  after(() => t.stop());

  describe('making a ticket', () => {
    it('is only for approved sellers', async () => {
      assert.equal((await t.api('/api/sell-tickets')).status, 401);
      const r = await t.api('/api/sell-tickets', { token: buyer.token });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'not_a_seller');
      assert.equal((await create(buyer.token)).status, 403);
    });

    it('checks the items', async () => {
      const bad = (body) => create(seller, body);
      assert.equal((await bad({ items: [] })).status, 400);
      assert.equal((await bad({})).status, 400);
      assert.equal((await bad({ items: [{ productName: 'x', quantity: 1 }] })).status, 400);
      assert.equal((await bad({ items: [{ productName: 'Booster Box', quantity: 0 }] })).status, 400);
      assert.equal((await bad({ items: [{ productName: 'Booster Box', quantity: 1.5 }] })).status, 400);
      assert.equal((await bad({ items: [{ productName: 'Booster Box', quantity: 1, minPricePerItemCents: -5 }] })).status, 400);
      assert.equal((await bad({ items: Array.from({ length: 26 }, () => ({ productName: 'Booster Box', quantity: 1 })) })).status, 400);
    });

    it('starts as Pending with a ticket number and a first line in the conversation', async () => {
      const r = await create();
      assert.equal(r.status, 201);
      assert.match(r.json.ticketNumber, /^SUB-\d{6}$/);
      assert.equal(r.json.status, 'submitted');
      assert.equal(r.json.statusLabel, 'Pending');
      assert.equal(r.json.offerCents, null);
      assert.equal(r.json.askingTotalCents, 10 * 11000 + 40 * 300);
      assert.equal(r.json.items.length, 2);
      assert.equal(r.json.messages.length, 1);
      assert.equal(r.json.messages[0].senderType, 'system');
      assert.equal(r.json.messages[0].kind, 'status');
      assert.equal(await auditCount('sell_ticket.submitted', r.json.id), 1);
    });

    it('lists my tickets, and keeps other sellers out of them', async () => {
      const r = await ticket();
      const list = await t.api('/api/sell-tickets', { token: seller });
      assert.ok(list.json.items.some((x) => x.id === r.id));
      assert.equal((await t.api('/api/sell-tickets', { token: hub })).json.items.length, 0);
      assert.equal((await mineOf(r.id, hub)).status, 404);
      assert.equal((await mineOf('nope')).status, 404);
      assert.equal((await t.api(`/api/sell-tickets/${r.id}/accept`, { method: 'POST', token: hub, body: {} })).status, 404);
    });
  });

  describe('staff side', () => {
    it('lets every staff role read the inbox, but only admins act on it', async () => {
      const made = await ticket();
      assert.equal((await t.api('/api/staff/tickets')).status, 401);
      assert.equal((await t.api('/api/staff/tickets', { token: seller })).status, 401);
      const list = await t.api('/api/staff/tickets', { token: support });
      assert.equal(list.status, 200);
      assert.ok(list.json.counts.submitted >= 1);
      assert.equal((await t.api(`/api/staff/tickets/${made.id}`, { token: support })).status, 200);
      assert.equal((await staff(`${made.id}/start-review`, {}, support)).status, 403);
      assert.equal((await staff(`${made.id}/offer`, { amountCents: 100 }, support)).status, 403);
    });

    it('shows the seller, searches and filters by status', async () => {
      const made = await ticket();
      const one = await t.api(`/api/staff/tickets/${made.id}`, { token: admin });
      assert.equal(one.json.seller.displayName, 'Demo Seller');
      assert.equal(one.json.seller.email, 'seller@tsm.test');
      assert.equal(one.json.messages[0].mine, false);
      const byNumber = await t.api(`/api/staff/tickets?q=${made.ticketNumber}`, { token: admin });
      assert.equal(byNumber.json.total, 1);
      const byProduct = await t.api('/api/staff/tickets?q=Crimson%20Storm', { token: admin });
      assert.ok(byProduct.json.total >= 1);
      assert.equal((await t.api('/api/staff/tickets?status=completed', { token: admin })).json.total, 0);
      assert.equal((await t.api('/api/staff/tickets?status=bogus', { token: admin })).status, 400);
      assert.equal((await t.api('/api/staff/tickets/not-an-id', { token: admin })).status, 404);
    });
  });

  describe('a full deal: review, offer, counter, new offer, accept, paid', () => {
    let id;
    const seen = async () => (await mineOf(id)).json;

    it('moves to In review when staff start looking at it', async () => {
      id = (await ticket()).id;
      const r = await staff(`${id}/start-review`);
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'in_review');
      assert.equal(r.json.statusLabel, 'In review');
      assert.equal((await staff(`${id}/start-review`)).status, 409); // already in review
      assert.equal((await seen()).statusLabel, 'In review');
    });

    it('keeps the seller from answering before there is an offer', async () => {
      for (const action of ['accept', 'counter']) {
        const r = await t.api(`/api/sell-tickets/${id}/${action}`, { method: 'POST', token: seller, body: { amountCents: 100000 } });
        assert.equal(r.status, 409, action);
        assert.equal(r.json.error.code, 'wrong_status');
      }
    });

    it('sends a price offer the seller can see', async () => {
      assert.equal((await staff(`${id}/offer`, { amountCents: 0 })).status, 400);
      assert.equal((await staff(`${id}/offer`, { amountCents: 1.5 })).status, 400);
      assert.equal((await staff(`${id}/offer`, { amountCents: 200_000_000 })).status, 400);
      const r = await staff(`${id}/offer`, { amountCents: 120000 });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'offer_sent');
      assert.equal(r.json.statusLabel, 'Offer sent');
      assert.equal(r.json.offerCents, 120000);
      assert.equal(r.json.offerBy, 'staff');
      const last = r.json.messages.at(-1);
      assert.equal(last.kind, 'offer');
      assert.equal(last.amountCents, 120000);
      assert.equal(last.body, 'We can offer $1,200.00 for the items on this ticket.');
      assert.equal(last.senderName, 'TSM Admin');

      const mineNow = await seen();
      assert.equal(mineNow.status, 'offer_sent');
      assert.equal(mineNow.offerCents, 120000);
      assert.equal(mineNow.messages.at(-1).mine, false); // from TSM, not from me
    });

    it('lets the seller counter with their own price', async () => {
      const bad = (body) => t.api(`/api/sell-tickets/${id}/counter`, { method: 'POST', token: seller, body });
      assert.equal((await bad({ amountCents: 0 })).status, 400);
      assert.equal((await bad({})).status, 400);
      assert.equal((await bad({ amountCents: 200_000_000 })).status, 400);
      const r = await bad({ amountCents: 150000, message: 'The boxes are fresh from the case' });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'countered');
      assert.equal(r.json.statusLabel, 'Counter offer');
      assert.equal(r.json.offerCents, 150000);
      assert.equal(r.json.offerBy, 'user');
      const last = r.json.messages.at(-1);
      assert.equal(last.kind, 'counter');
      assert.equal(last.amountCents, 150000);
      assert.equal(last.body, 'Countered with $1,500.00: The boxes are fresh from the case');
      assert.equal(last.mine, true);
      // nothing more for the seller to do until TSM answers
      assert.equal((await t.api(`/api/sell-tickets/${id}/accept`, { method: 'POST', token: seller, body: {} })).status, 409);
      assert.equal((await bad({ amountCents: 160000 })).status, 409);
    });

    it('lets staff answer a counter with a new offer', async () => {
      const r = await staff(`${id}/offer`, { amountCents: 135000, message: 'Best we can do.' });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'offer_sent');
      assert.equal(r.json.offerCents, 135000);
      assert.equal(r.json.offerBy, 'staff');
      assert.equal(r.json.messages.at(-1).body, 'We can offer $1,350.00 for the items on this ticket. Best we can do.');
    });

    it('lets both sides keep talking while the deal is open', async () => {
      const a = await t.api(`/api/sell-tickets/${id}/messages`, { method: 'POST', token: seller, body: { body: 'Can you pick up?' } });
      assert.equal(a.status, 201);
      assert.equal(a.json.mine, true);
      const b = await staff(`${id}/messages`, { body: 'We will email a prepaid label.' });
      assert.equal(b.status, 201);
      assert.equal(b.json.senderType, 'staff');
      assert.equal((await t.api(`/api/sell-tickets/${id}/messages`, { method: 'POST', token: seller, body: { body: '  ' } })).status, 400);
      assert.equal((await staff(`${id}/messages`, { body: '' })).status, 400);
      const thread = (await seen()).messages;
      assert.equal(thread.find((m) => m.body === 'We will email a prepaid label.').mine, false);
    });

    it('turns Accepted when the seller takes the offer', async () => {
      const r = await t.api(`/api/sell-tickets/${id}/accept`, { method: 'POST', token: seller, body: {} });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'accepted');
      assert.equal(r.json.statusLabel, 'Accepted');
      const last = r.json.messages.at(-1);
      assert.equal(last.kind, 'accept');
      assert.equal(last.amountCents, 135000);
      assert.equal(last.body, 'Accepted the offer of $1,350.00');
      // the deal is fixed now: nobody can send a new price or walk away; only the payment step is left
      assert.equal((await staff(`${id}/offer`, { amountCents: 1000 })).status, 409);
      assert.equal((await staff(`${id}/decline`)).status, 409);
      assert.equal((await t.api(`/api/sell-tickets/${id}/decline`, { method: 'POST', token: seller, body: {} })).status, 409);
      assert.equal((await t.api(`/api/sell-tickets/${id}/counter`, { method: 'POST', token: seller, body: { amountCents: 1000 } })).status, 409);
      assert.equal((await staff(`${id}/start-review`)).status, 409);
    });

    it('is finished by staff once the money was sent outside the app', async () => {
      const done = await staff(`${id}/complete`);
      assert.equal(done.status, 200);
      assert.equal(done.json.status, 'completed');
      assert.equal(done.json.statusLabel, 'Completed');
      assert.ok(done.json.closedAt);
      assert.equal(done.json.messages.at(-1).body, 'Payment of $1,350.00 was sent outside the app. This ticket is complete.');
      // nothing can be added to a finished ticket
      assert.equal((await t.api(`/api/sell-tickets/${id}/messages`, { method: 'POST', token: seller, body: { body: 'Thanks!' } })).status, 409);
      assert.equal((await staff(`${id}/messages`, { body: 'Thanks!' })).status, 409);
      assert.equal((await t.api(`/api/sell-tickets/${id}/decline`, { method: 'POST', token: seller, body: {} })).status, 409);
      assert.equal((await staff(`${id}/complete`)).status, 409);
      assert.equal((await staff(`${id}/decline`)).status, 409);
      assert.equal(await auditCount('sell_ticket.completed', id), 1);
      assert.equal(await auditCount('sell_ticket.offer_sent', id), 2);
      assert.equal(await auditCount('sell_ticket.countered', id), 1);
      assert.equal(await auditCount('sell_ticket.accepted', id), 1);
    });

    it('cannot be completed before the seller accepted', async () => {
      const early = await ticket();
      assert.equal((await staff(`${early.id}/complete`)).status, 409);
      await staff(`${early.id}/offer`, { amountCents: 50000 });
      assert.equal((await staff(`${early.id}/complete`)).status, 409);
    });
  });

  describe('other ways a deal ends', () => {
    it('lets staff accept the seller’s counter price', async () => {
      const made = await ticket();
      await staff(`${made.id}/offer`, { amountCents: 100000 });
      assert.equal((await staff(`${made.id}/accept-counter`)).status, 409); // nothing to accept yet
      await t.api(`/api/sell-tickets/${made.id}/counter`, { method: 'POST', token: seller, body: { amountCents: 130000 } });
      const r = await staff(`${made.id}/accept-counter`);
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'accepted');
      assert.equal(r.json.offerCents, 130000);
      assert.equal(r.json.messages.at(-1).body, 'We accept your price of $1,300.00.');
      assert.equal((await staff(`${made.id}/complete`)).json.status, 'completed');
    });

    it('lets the seller walk away, with a note, and then closes the ticket', async () => {
      const made = await ticket();
      await staff(`${made.id}/offer`, { amountCents: 10000 });
      const r = await t.api(`/api/sell-tickets/${made.id}/decline`, { method: 'POST', token: seller, body: { note: 'Too low for me' } });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'declined');
      assert.equal(r.json.statusLabel, 'Declined');
      assert.equal(r.json.decisionNote, 'Too low for me');
      assert.ok(r.json.closedAt);
      assert.equal(r.json.messages.at(-1).body, 'Declined: Too low for me');
      assert.equal((await staff(`${made.id}/offer`, { amountCents: 20000 })).status, 409);
      assert.equal((await t.api(`/api/sell-tickets/${made.id}/accept`, { method: 'POST', token: seller, body: {} })).status, 409);
    });

    it('lets the seller withdraw a ticket that is still being reviewed', async () => {
      const made = await ticket();
      const r = await t.api(`/api/sell-tickets/${made.id}/decline`, { method: 'POST', token: seller, body: {} });
      assert.equal(r.json.status, 'declined');
      assert.equal(r.json.messages.at(-1).body, 'Declined');
    });

    it('lets staff decline, and the seller sees why', async () => {
      const made = await ticket();
      const r = await staff(`${made.id}/decline`, { note: 'We already stock these' });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'declined');
      const theirs = (await mineOf(made.id)).json;
      assert.equal(theirs.decisionNote, 'We already stock these');
      assert.equal(theirs.messages.at(-1).body, 'We are not able to move forward: We already stock these');
      assert.equal(await auditCount('sell_ticket.declined_by_staff', made.id), 1);
    });

    it('lets staff drop one item from a deal and put it back', async () => {
      const made = await ticket();
      const [first, second] = made.items;
      const drop = await staff(`${made.id}/items/${first.id}`, { removed: true });
      assert.equal(drop.status, 200);
      assert.equal(drop.json.items.find((i) => i.id === first.id).removedByAdmin, true);
      assert.equal(drop.json.askingTotalCents, second.quantity * second.minPricePerItemCents);
      assert.match(drop.json.messages.at(-1).body, /^Removed "/);
      assert.equal((await mineOf(made.id)).json.items.find((i) => i.id === first.id).removedByAdmin, true);
      const back = await staff(`${made.id}/items/${first.id}`, { removed: false });
      assert.equal(back.json.askingTotalCents, 10 * 11000 + 40 * 300);
      assert.equal((await staff(`${made.id}/items/${randomUUID()}`, { removed: true })).status, 404);
      assert.equal((await staff(`${made.id}/items/${first.id}`, { removed: 'yes' })).status, 400);
      // not after the seller accepted
      await staff(`${made.id}/offer`, { amountCents: 40000 });
      await t.api(`/api/sell-tickets/${made.id}/accept`, { method: 'POST', token: seller, body: {} });
      assert.equal((await staff(`${made.id}/items/${first.id}`, { removed: true })).status, 409);
    });
  });
});
