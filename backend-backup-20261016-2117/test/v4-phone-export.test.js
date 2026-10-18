import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PDF_BYTES, PNG_BYTES, startServer } from './helpers.js';
import { newUser } from './v4-helpers.js';

describe('phone numbers, app link and data export', () => {
  let t;
  let user;

  before(async () => {
    t = await startServer();
    user = await newUser(t, 'phoney');
  });
  after(() => t.stop());

  it('stores every phone number as +1 (xxx) - xxx - xxxx', async () => {
    for (const typed of ['(555) 123-4567', '5551234567', '555.123.4567', '+1 555 123 4567', '1-555-123-4567']) {
      const r = await t.api('/api/me', { method: 'PATCH', token: user.token, body: { phone: typed } });
      assert.equal(r.status, 200, typed);
      assert.equal(r.json.phone, '+1 (555) - 123 - 4567', typed);
    }
    assert.equal((await t.api('/api/me', { token: user.token })).json.phone, '+1 (555) - 123 - 4567');
  });

  it('refuses numbers that are not 10 digits, and lets blank clear it', async () => {
    for (const typed of ['12345', 'abc', '555123456', '555123456789']) {
      const r = await t.api('/api/me', { method: 'PATCH', token: user.token, body: { phone: typed } });
      assert.equal(r.status, 400, typed);
      assert.ok(r.json.error.details.some((d) => d.field === 'phone'), typed);
    }
    const cleared = await t.api('/api/me', { method: 'PATCH', token: user.token, body: { phone: '' } });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.json.phone, null);
  });

  it('formats the phone on a seller application too, and checks it', async () => {
    const apply = (phoneNumber, who = user) =>
      t.apiForm('/api/me/seller-application', {
        token: who.token,
        fields: { businessName: 'Phone Test Cards', businessAddress: '1 Main St, Columbus, OH 43004', contactEmail: 'owner@example.com', phoneNumber, sourceType: 'distributor', distributorList: 'Acme' },
        files: [{ name: 'permit.pdf', type: 'application/pdf', data: PDF_BYTES }, { name: 'id.png', type: 'image/png', data: PNG_BYTES }],
      });
    const bad = await apply('12345');
    assert.equal(bad.status, 400);
    assert.ok(bad.json.error.details.some((d) => d.field === 'phoneNumber'));
    const ok = await apply('5550101999');
    assert.equal(ok.status, 201);
    const admin = await t.staffLogin();
    const seen = await t.api(`/api/staff/seller-applications/${ok.json.application.id}`, { token: admin });
    assert.equal(seen.json.application.phoneNumber, '+1 (555) - 010 - 1999');
  });

  it('tells the app where the seller dashboard website is, without a sign-in', async () => {
    const r = await t.api('/api/app-config');
    assert.equal(r.status, 200);
    assert.match(r.json.sellerPortalUrl, /^https?:\/\/[^/]+(:\d+)?\/login\?as=seller$/);
    assert.equal(typeof r.json.sellerPortalIsConfigured, 'boolean');
  });

  it('includes orders, reviews, tickets and support requests in the person’s data export', async () => {
    const asker = await newUser(t, 'exporter');
    await t.api('/api/support', { method: 'POST', token: asker.token, body: { subject: 'Export check', message: 'Please keep this in my export.' } });
    const r = await t.api('/api/me/export', { token: asker.token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.orders, []);
    assert.deepEqual(r.json.reviewsWritten, []);
    assert.deepEqual(r.json.sellTickets, []);
    assert.equal(r.json.supportRequests.length, 1);
    assert.equal(r.json.supportRequests[0].subject, 'Export check');
    assert.match(r.json.supportRequests[0].ref, /^SUP-\d{6}$/);
  });
});
