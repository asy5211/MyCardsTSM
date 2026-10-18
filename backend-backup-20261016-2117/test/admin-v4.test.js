import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, PDF_BYTES, PNG_BYTES, startServer } from './helpers.js';
import { auditCount, looseOffer, newUser, readyProducts, setAddress } from './v4-helpers.js';

/** A small CSV reader that understands quotes (enough for checking the export). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r') continue;
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe('admin v4: brand order, activity export, revoking selling, fees', () => {
  let t;
  let admin;
  let support;
  let hub;
  let hubId;
  let products;

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
  });
  after(() => t.stop());

  describe('shop-by-brand order', () => {
    const list = async () => (await t.api('/api/staff/brands', { token: admin })).json;
    const reorder = (ids, token = admin) => t.api('/api/staff/brands/order', { method: 'PUT', token, body: { ids } });
    const publicNames = async () => (await t.api('/api/brands')).json.map((b) => b.name);

    it('puts a new brand at the bottom of the list, then the next one below it', async () => {
      const before = await list();
      const a = await t.api('/api/staff/brands', { method: 'POST', token: admin, body: { name: 'Zeta Cards' } });
      assert.equal(a.status, 201);
      assert.equal(a.json.sortOrder, Math.max(...before.map((b) => b.sortOrder)) + 1);
      const b = await t.api('/api/staff/brands', { method: 'POST', token: admin, body: { name: 'Omega Cards' } });
      assert.equal(b.json.sortOrder, a.json.sortOrder + 1);
      const now = await list();
      assert.deepEqual(now.slice(-2).map((x) => x.name), ['Zeta Cards', 'Omega Cards']);
      assert.deepEqual((await publicNames()).slice(-2), ['Zeta Cards', 'Omega Cards']); // the app's grid shows the same order
    });

    it('still honours an order typed in by hand', async () => {
      const r = await t.api('/api/staff/brands', { method: 'POST', token: admin, body: { name: 'Pinned First', sortOrder: 0 } });
      assert.equal(r.status, 201);
      assert.equal(r.json.sortOrder, 0);
    });

    it('saves a drag-and-drop move (the whole list in its new order)', async () => {
      const before = await list();
      // drag the 4th brand to the top
      const moved = [before[3], ...before.filter((_, i) => i !== 3)];
      const r = await reorder(moved.map((b) => b.id));
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.map((b) => b.id), moved.map((b) => b.id));
      assert.deepEqual(r.json.map((b) => b.sortOrder), moved.map((_, i) => i + 1)); // no gaps, no duplicates
      assert.deepEqual((await list()).map((b) => b.id), moved.map((b) => b.id));
      assert.deepEqual(await publicNames(), moved.filter((b) => b.isActive).map((b) => b.name));
      assert.ok((await auditCount('brand.reordered')) >= 1);
    });

    it('saves after every move, one move at a time', async () => {
      let order = (await list()).map((b) => b.id);
      for (const [from, to] of [[0, 2], [5, 1], [2, 8]]) {
        const next = [...order];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        assert.equal((await reorder(next)).status, 200);
        order = next;
        assert.deepEqual((await list()).map((b) => b.id), order);
      }
    });

    it('refuses a list that is incomplete, repeated or out of date', async () => {
      const ids = (await list()).map((b) => b.id);
      const short = await reorder(ids.slice(1));
      assert.equal(short.status, 409); // someone added or removed a brand meanwhile
      const stranger = await reorder([...ids.slice(1), '00000000-0000-4000-8000-000000000000']);
      assert.equal(stranger.status, 409);
      const twice = await reorder([ids[0], ...ids]);
      assert.equal(twice.status, 400);
      assert.equal((await reorder([])).status, 400);
      assert.equal((await reorder(['nope'])).status, 400);
      assert.deepEqual((await list()).map((b) => b.id), ids); // nothing changed
    });

    it('is for admins only', async () => {
      const ids = (await list()).map((b) => b.id);
      assert.equal((await t.api('/api/staff/brands/order', { method: 'PUT', body: { ids } })).status, 401);
      assert.equal((await reorder(ids, support)).status, 403);
    });
  });

  describe('exporting the activity log for a time range', () => {
    const exportCsv = (query, token = admin) => t.download(`/api/staff/audit/export${query}`, token);
    const body = (r) => r.bytes.toString('utf8');
    const asJson = (r) => JSON.parse(body(r));
    const insert = (createdAt, over = {}) =>
      pool.query(
        'INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [over.actorType ?? 'system', null, over.action ?? 'test.range', 'test', over.entityId ?? null, over.details ?? null, null, createdAt],
      );

    before(async () => {
      await insert('2026-01-09 23:59:59.000', { entityId: 'before-start' });
      await insert('2026-01-10 00:00:00.000', { entityId: 'first-moment' });
      await insert('2026-01-10 12:00:00.000', { entityId: '=HYPERLINK("x"),1', details: JSON.stringify({ note: 'a,b' }) });
      await insert('2026-01-10 23:59:59.500', { entityId: 'last-moment' });
      await insert('2026-01-11 00:00:00.000', { entityId: 'after-end' });
    });

    it('needs a start and an end date, and a staff login', async () => {
      assert.equal((await exportCsv('?from=2026-01-10&to=2026-01-10', null)).status, 401);
      for (const query of ['', '?from=2026-01-10', '?to=2026-01-10', '?from=&to=', '?from=10-01-2026&to=11-01-2026', '?from=2026-02-30&to=2026-03-01']) {
        const r = await exportCsv(query);
        assert.equal(r.status, 400, query);
        assert.equal(asJson(r).error.code, 'validation_error', query);
      }
    });

    it('refuses an end date before the start date and ranges longer than a year', async () => {
      const backwards = await exportCsv('?from=2026-01-11&to=2026-01-10');
      assert.equal(backwards.status, 400);
      assert.equal(asJson(backwards).error.details[0].field, 'to');
      const long = await exportCsv('?from=2024-01-01&to=2025-12-31');
      assert.equal(long.status, 400);
      assert.match(asJson(long).error.details[0].message, /at most 366 days/);
      assert.equal((await exportCsv('?from=2025-01-01&to=2025-12-31')).status, 200); // a full year is fine
    });

    it('returns a CSV of exactly that range, whole days included', async () => {
      const r = await exportCsv('?from=2026-01-10&to=2026-01-10&action=test.range');
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type'), /^text\/csv/);
      assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tsm-activity-2026-01-10_to_2026-01-10.csv"');
      const text = body(r);
      assert.ok(text.startsWith('﻿'), 'starts with a byte-order mark so Excel reads it as UTF-8');
      const rows = parseCsv(text.slice(1));
      assert.deepEqual(rows[0], ['id', 'time_utc', 'actor_type', 'actor_name', 'actor_id', 'action', 'entity_type', 'entity_id', 'ip_address', 'details']);
      assert.equal(rows.length, 1 + 3);
      assert.deepEqual(rows.slice(1).map((c) => c[1]), ['2026-01-10T00:00:00.000Z', '2026-01-10T12:00:00.000Z', '2026-01-10T23:59:59.500Z']);
      assert.ok(rows.slice(1).every((c) => c[2] === 'system' && c[5] === 'test.range' && c[6] === 'test'));
      const ids = rows.slice(1).map((c) => Number(c[0]));
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
    });

    it('stops spreadsheet formulas and keeps commas and quotes intact', async () => {
      const rows = parseCsv(body(await exportCsv('?from=2026-01-10&to=2026-01-10&action=test.range')).slice(1));
      const odd = rows.find((c) => c[1] === '2026-01-10T12:00:00.000Z');
      assert.equal(odd[7], `'=HYPERLINK("x"),1`); // a leading = is defused, quotes and commas survive
      assert.equal(odd[9], '{"note":"a,b"}');
    });

    it('widens with the dates, filters by action, and can be empty', async () => {
      const wide = parseCsv(body(await exportCsv('?from=2026-01-09&to=2026-01-11&action=test.range')).slice(1));
      assert.equal(wide.length, 1 + 5);
      const none = parseCsv(body(await exportCsv('?from=2026-01-10&to=2026-01-10&action=nothing.like.this')).slice(1));
      assert.equal(none.length, 1); // just the header
      const byActor = parseCsv(body(await exportCsv('?from=2026-01-10&to=2026-01-10&actorType=staff&action=test.range')).slice(1));
      assert.equal(byActor.length, 1);
    });

    it('is open to every staff role and writes itself to the log', async () => {
      const before = await auditCount('audit.exported');
      assert.equal((await exportCsv('?from=2026-01-10&to=2026-01-10&action=test.range', support)).status, 200);
      assert.equal(await auditCount('audit.exported'), before + 1);
      const [[row]] = await pool.query("SELECT details FROM audit_logs WHERE action = 'audit.exported' ORDER BY id DESC LIMIT 1");
      const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      assert.equal(details.from, '2026-01-10');
      assert.equal(details.to, '2026-01-10');
      assert.equal(details.rows, 3);
    });

    it('refuses a range with too many entries instead of building a giant file', async () => {
      const batch = Array.from({ length: 1000 }, () => ['system', null, 'test.bulk', 'test', null, null, null, '2025-06-01 12:00:00.000']);
      try {
        for (let i = 0; i < 21; i++) {
          await pool.query('INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, details, ip_address, created_at) VALUES ?', [batch]);
        }
        const r = await exportCsv('?from=2025-06-01&to=2025-06-01&action=test.bulk');
        assert.equal(r.status, 400);
        assert.equal(asJson(r).error.code, 'too_many_rows');
        // a narrower filter on the same day still works
        assert.equal((await exportCsv('?from=2025-06-01&to=2025-06-01&action=test.range')).status, 200);
      } finally {
        await pool.query("DELETE FROM audit_logs WHERE action = 'test.bulk'");
      }
    });

    it('keeps the on-screen list working with the same date filters', async () => {
      const r = await t.api('/api/staff/audit?from=2026-01-10&to=2026-01-10&action=test.range', { token: admin });
      assert.equal(r.status, 200);
      assert.equal(r.json.total, 3);
    });
  });

  describe('revoking selling without touching the account', () => {
    let hubOffer;
    let buyer;

    before(async () => {
      await pool.query('DELETE FROM listings');
      hubOffer = await looseOffer(t, hub, products[0]);
      buyer = await newUser(t, 'shopper', { address: true });
    });

    const revoke = (id, body, token = admin) => t.api(`/api/staff/sellers/${id}/revoke`, { method: 'POST', token, body });
    const shopListings = async () => (await t.api(`/api/products/${products[0]}`)).json.listings;

    it('needs an admin and a reason', async () => {
      assert.equal((await revoke(hubId, { reason: 'Policy' }, support)).status, 403);
      assert.equal((await t.api(`/api/staff/sellers/${hubId}/revoke`, { method: 'POST', body: { reason: 'Policy' } })).status, 401);
      assert.equal((await revoke(hubId, {})).status, 400);
      assert.equal((await revoke(hubId, { reason: 'x' })).status, 400);
      assert.equal((await revoke('00000000-0000-4000-8000-000000000000', { reason: 'Policy' })).status, 404);
    });

    it('takes away selling: the portal closes and the offers leave the shop', async () => {
      assert.ok((await shopListings()).some((l) => l.id === hubOffer.id));
      const r = await revoke(hubId, { reason: 'Repeated shipping problems' });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'revoked');
      assert.equal(r.json.revokedReason, 'Repeated shipping problems');
      assert.ok(r.json.revokedAt);
      assert.equal((await revoke(hubId, { reason: 'Again' })).status, 409);

      const portal = await t.api('/api/seller/me', { token: hub });
      assert.equal(portal.status, 403);
      assert.equal(portal.json.error.code, 'seller_revoked');
      assert.equal((await t.api('/api/seller/listings', { token: hub })).status, 403);
      assert.equal((await t.api('/api/seller/orders', { token: hub })).status, 403);
      assert.equal((await t.api('/api/sell-tickets', { token: hub })).status, 403);
      assert.ok(!(await shopListings()).some((l) => l.id === hubOffer.id));
      const staffView = await t.api('/api/staff/listings?status=seller_revoked', { token: admin });
      assert.ok(staffView.json.items.some((l) => l.id === hubOffer.id));
      assert.equal(staffView.json.items.find((l) => l.id === hubOffer.id).status, 'seller_revoked');
      assert.equal((await t.api('/api/staff/sellers?status=revoked', { token: admin })).json.items.length, 1);
      const dash = (await t.api('/api/staff/dashboard', { token: admin })).json;
      assert.equal(dash.sellers.revoked, 1);
      for (const key of ['tickets', 'support', 'orders']) {
        assert.ok(Object.keys(dash[key]).length > 0, `dashboard.${key} is present`);
        for (const value of Object.values(dash[key])) assert.equal(typeof value, 'number');
      }
    });

    it('leaves the person’s account fully working (not suspended)', async () => {
      const me = await t.api('/api/me', { token: hub });
      assert.equal(me.status, 200); // the same sign-in still works
      assert.equal(me.json.isApprovedSeller, false);
      assert.equal(me.json.sellerProfile.status, 'revoked');
      assert.equal(me.json.sellerProfile.statusNote, 'Repeated shipping problems');
      assert.equal((await t.api('/api/auth/login', { method: 'POST', body: { login: 'hub@tsm.test', password: DEMO_PASSWORD } })).status, 200);
      const user = await t.api(`/api/staff/users/${hubId}`, { token: admin });
      assert.equal(user.json.status, 'active');
      // they can still shop like anyone else
      await setAddress(t, hub);
      const other = await looseOffer(t, await t.login('seller@tsm.test', DEMO_PASSWORD), products[1]);
      const bought = await t.api('/api/orders', { method: 'POST', token: hub, body: { items: [{ listingId: other.id, quantity: 1 }] } });
      assert.equal(bought.status, 201);
      assert.equal((await t.api('/api/orders', { token: hub })).json.total, 1);
      assert.equal((await t.api('/api/support', { method: 'POST', token: hub, body: { subject: 'About my selling', message: 'Why was my selling removed?' } })).status, 201);
    });

    it('does not let a revoked person apply again', async () => {
      const r = await t.apiForm('/api/me/seller-application', {
        token: hub,
        fields: { businessName: 'Hub Again', businessAddress: '1 Main St, Columbus, OH 43004', contactEmail: 'hub@example.com', phoneNumber: '5550101999', sourceType: 'distributor', distributorList: 'Acme' },
        files: [{ name: 'permit.pdf', type: 'application/pdf', data: PDF_BYTES }, { name: 'id.png', type: 'image/png', data: PNG_BYTES }],
      });
      assert.equal(r.status, 409);
      assert.equal(r.json.error.code, 'seller_revoked');
    });

    it('restores selling when staff lift it, and the offers come back', async () => {
      const r = await t.api(`/api/staff/sellers/${hubId}/reinstate`, { method: 'POST', token: admin, body: {} });
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'active');
      assert.equal(r.json.revokedAt, null);
      assert.equal(r.json.revokedReason, null);
      assert.equal((await t.api('/api/seller/me', { token: hub })).status, 200);
      assert.ok((await shopListings()).some((l) => l.id === hubOffer.id));
      assert.equal((await t.api('/api/me', { token: hub })).json.isApprovedSeller, true);
      assert.equal(await auditCount('seller.selling_revoked', hubId), 1);
      assert.equal(await auditCount('seller.selling_restored', hubId), 1);
      assert.equal((await t.api(`/api/staff/sellers/${hubId}/reinstate`, { method: 'POST', token: admin, body: {} })).status, 409); // nothing to lift
    });

    it('can revoke someone who is suspended, and restoring clears both', async () => {
      assert.equal((await t.api(`/api/staff/sellers/${hubId}/suspend`, { method: 'POST', token: admin, body: { reason: 'Review' } })).status, 200);
      assert.equal((await revoke(hubId, { reason: 'Final decision' })).json.status, 'revoked');
      const back = await t.api(`/api/staff/sellers/${hubId}/reinstate`, { method: 'POST', token: admin, body: {} });
      assert.equal(back.json.status, 'active');
      assert.equal(back.json.suspendedAt, null);
      assert.equal(back.json.revokedAt, null);
    });

    it('is different from suspending: a suspended seller shows as suspended, not revoked', async () => {
      await t.api(`/api/staff/sellers/${hubId}/suspend`, { method: 'POST', token: admin, body: { reason: 'Quick check' } });
      const portal = await t.api('/api/seller/me', { token: hub });
      assert.equal(portal.json.error.code, 'seller_suspended');
      assert.equal((await t.api('/api/me', { token: hub })).json.sellerProfile.status, 'suspended');
      await t.api(`/api/staff/sellers/${hubId}/reinstate`, { method: 'POST', token: admin, body: {} });
    });
  });

  describe('fee settings', () => {
    const put = (body, token = admin) => t.api('/api/staff/settings/fees', { method: 'PUT', token, body });

    it('starts at TSM 5% and no payment fee, readable by every staff role', async () => {
      assert.equal((await t.api('/api/staff/settings')).status, 401);
      const r = await t.api('/api/staff/settings', { token: support });
      assert.equal(r.status, 200);
      assert.equal(r.json.fees.tsmFeeBps, 500);
      assert.equal(r.json.fees.processingFeeBps, 0);
      assert.equal(r.json.fees.totalBps, 500);
      assert.deepEqual(r.json.fees.limits, { tsmFeeBps: 3000, processingFeeBps: 1000 });
    });

    it('is changed by admins only, with sensible limits', async () => {
      assert.equal((await put({ processingFeeBps: 290 }, support)).status, 403);
      assert.equal((await put({})).status, 400);
      assert.equal((await put({ tsmFeeBps: -1 })).status, 400);
      assert.equal((await put({ tsmFeeBps: 3001 })).status, 400);
      assert.equal((await put({ processingFeeBps: 1001 })).status, 400);
      assert.equal((await put({ processingFeeBps: 2.5 })).status, 400);
      assert.equal((await put({ processingFeeBps: '290' })).status, 400);
      assert.equal((await t.api('/api/staff/settings', { token: admin })).json.fees.processingFeeBps, 0); // unchanged
    });

    it('saves a change, reports who made it, and records before and after in the log', async () => {
      const r = await put({ processingFeeBps: 290 });
      assert.equal(r.status, 200);
      assert.equal(r.json.fees.processingFeeBps, 290);
      assert.equal(r.json.fees.tsmFeeBps, 500); // untouched
      assert.equal(r.json.fees.totalBps, 790);
      assert.equal(r.json.fees.updatedBy, 'TSM Admin');
      assert.ok(r.json.fees.updatedAt);
      const [[row]] = await pool.query("SELECT details FROM audit_logs WHERE action = 'settings.fees_updated' ORDER BY id DESC LIMIT 1");
      const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      assert.deepEqual(details.before, { tsmFeeBps: 500, processingFeeBps: 0 });
      assert.deepEqual(details.after, { tsmFeeBps: 500, processingFeeBps: 290 });
      // sellers see the new rate straight away
      const seller = await t.api('/api/seller/me', { token: hub });
      assert.deepEqual(seller.json.fees, { tsmFeeBps: 500, processingFeeBps: 290, totalBps: 790 });
    });
  });
});
