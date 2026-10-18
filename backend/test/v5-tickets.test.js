import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';

describe('v5: sell-to-us tickets can accept the seller’s asking price', () => {
  let t;
  let admin;
  let support;
  let seller;

  const items = [
    { productName: 'Crimson Storm Booster Box', quantity: 10, source: 'Case from distributor', minPricePerItemCents: 11000 },
    { productName: 'Standard Pack', quantity: 40, source: 'Retail', minPricePerItemCents: 300 },
  ];
  const create = async (body = { items }) => {
    const r = await t.api('/api/sell-tickets', { method: 'POST', token: seller, body });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json;
  };
  const staff = (path, body = {}, token = admin) => t.api(`/api/staff/tickets/${path}`, { method: 'POST', token, body });
  const mine = async (id) => (await t.api(`/api/sell-tickets/${id}`, { token: seller })).json;

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    await pool.query(
      "INSERT INTO admin_staff (id, email, name, password_hash, role) VALUES (UUID(), 'support@tsm.test', 'Sam Support', ?, 'support')",
      [await hashPassword('SupportPass1!')],
    );
    support = await t.staffLogin('support@tsm.test', 'SupportPass1!');
    seller = await t.login('seller@tsm.test', DEMO_PASSWORD);
  });
  after(() => t.stop());

  it("accepts the asking price straight away (122,000 cents here) and tells the seller", async () => {
    const tk = await create();
    assert.equal(tk.askingTotalCents, 10 * 11000 + 40 * 300);
    assert.equal((await staff(`${tk.id}/accept-ask`, {}, support)).status, 403); // the read-only role may not
    const r = await staff(`${tk.id}/accept-ask`);
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'accepted');
    assert.equal(r.json.offerCents, 122000);
    assert.equal(r.json.offerBy, 'staff');
    const last = r.json.messages.at(-1);
    assert.equal(last.kind, 'accept');
    assert.equal(last.amountCents, 122000);
    assert.match(last.body, /accept your asking price of \$1,220\.00/);
    assert.equal((await mine(tk.id)).status, 'accepted');
    assert.equal((await staff(`${tk.id}/accept-ask`)).status, 409); // already accepted
    assert.equal((await staff(`${tk.id}/complete`)).json.status, 'completed'); // and the deal carries on as normal
  });

  it('works while the ticket is in review, and counts only the items still in the deal', async () => {
    const tk = await create();
    assert.equal((await staff(`${tk.id}/start-review`)).json.status, 'in_review');
    await staff(`${tk.id}/items/${tk.items[1].id}`, { removed: true });
    const r = await staff(`${tk.id}/accept-ask`);
    assert.equal(r.status, 200);
    assert.equal(r.json.offerCents, 110000);
  });

  it('is not possible once an offer is out, or when the seller named no price; a counter offer or decline still works', async () => {
    const tk = await create();
    await staff(`${tk.id}/offer`, { amountCents: 90000, message: 'Best we can do.' });
    const late = await staff(`${tk.id}/accept-ask`);
    assert.equal(late.status, 409);
    assert.equal(late.json.error.code, 'wrong_status');
    const free = await create({ items: [{ productName: 'Mystery Lot', quantity: 3 }] });
    const noPrice = await staff(`${free.id}/accept-ask`);
    assert.equal(noPrice.status, 409);
    assert.match(noPrice.json.error.message, /did not name a price/);
    assert.equal((await staff(`${free.id}/offer`, { amountCents: 5000 })).json.status, 'offer_sent'); // counter offer
    const tk2 = await create();
    assert.equal((await staff(`${tk2.id}/decline`, { note: 'Not buying this month.' })).json.status, 'declined');
  });

  it('lists tickets newest first or oldest first', async () => {
    await pool.query("UPDATE sell_tickets SET updated_at = NOW(3) - INTERVAL 10 DAY ORDER BY created_at LIMIT 1");
    const newest = (await t.api('/api/staff/tickets?sort=newest', { token: support })).json.items.map((i) => i.id);
    const oldest = (await t.api('/api/staff/tickets?sort=oldest', { token: support })).json.items.map((i) => i.id);
    assert.deepEqual(oldest, [...newest].reverse());
    assert.equal((await t.api('/api/staff/tickets?sort=sideways', { token: support })).status, 400);
  });
});
