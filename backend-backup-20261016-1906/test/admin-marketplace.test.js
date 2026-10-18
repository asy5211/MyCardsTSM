import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, makeReady, startServer } from './helpers.js';

describe('admin: sellers, users, offers, dashboard, audit', () => {
  let t;
  let admin;
  let support;
  let buyer;
  let seller;
  let demoSellerId;
  let productId;
  let listingId;

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    await pool.query(
      "INSERT INTO admin_staff (id, email, name, password_hash, role) VALUES (UUID(), 'support@tsm.test', 'Sam Support', ?, 'support')",
      [await hashPassword('SupportPass1!')],
    );
    support = await t.staffLogin('support@tsm.test', 'SupportPass1!');
    buyer = await t.login('buyer@tsm.test', DEMO_PASSWORD);
    seller = await t.login('seller@tsm.test', DEMO_PASSWORD);
    demoSellerId = (await t.api('/api/staff/sellers?q=Demo%20Seller', { token: admin })).json.items[0].id;
    productId = (await t.api('/api/staff/products?limit=1', { token: admin })).json.items[0].id;
    await makeReady(t, admin, productId);
    await pool.query('DELETE FROM listings');
    const made = await t.api('/api/seller/listings', {
      method: 'POST', token: seller,
      body: { productId, priceCents: 5000, quantityAvailable: 3, sourceType: 'manufacturer_direct', distributor: 'Factory Direct', packaging: 'loose' },
    });
    listingId = made.json.id;
  });
  after(() => t.stop());

  describe('access', () => {
    it('is staff-only', async () => {
      for (const path of ['/api/staff/sellers', '/api/staff/users', '/api/staff/listings', '/api/staff/dashboard', '/api/staff/audit', '/api/staff/payouts']) {
        assert.equal((await t.api(path)).status, 401, path);
        assert.equal((await t.api(path, { token: buyer })).status, 401, path);
        assert.equal((await t.api(path, { token: seller })).status, 401, path);
        assert.equal((await t.api(path, { token: support })).status, 200, path); // read-only role may look
      }
    });

    it('support staff cannot suspend, hold, or release anything', async () => {
      const calls = [
        [`/api/staff/sellers/${demoSellerId}/suspend`, { reason: 'nope' }],
        [`/api/staff/sellers/${demoSellerId}/reinstate`, {}],
        [`/api/staff/listings/${listingId}/hold`, { reason: 'nope' }],
        [`/api/staff/listings/${listingId}/release`, {}],
        ['/api/staff/users/00000000-0000-4000-8000-000000000000/suspend', { reason: 'nope' }],
      ];
      for (const [path, body] of calls) assert.equal((await t.api(path, { method: 'POST', token: support, body })).status, 403, path);
    });
  });

  describe('sellers', () => {
    it('lists sellers with offer counts and balances', async () => {
      const r = await t.api('/api/staff/sellers', { token: admin });
      assert.equal(r.json.total, 6);
      const demo = r.json.items.find((s) => s.displayName === 'Demo Seller');
      assert.equal(demo.listingCount, 1);
      assert.equal(demo.liveListingCount, 1);
      assert.equal(demo.status, 'active');
      assert.ok(demo.availableCents > 0, 'demo earnings should be waiting');
      assert.equal((await t.api('/api/staff/sellers?status=suspended', { token: admin })).json.total, 0);
      assert.equal((await t.api('/api/staff/sellers?q=elite', { token: admin })).json.items.length, 1);
    });

    it('shows one seller with application, offers, earnings and activity', async () => {
      const r = await t.api(`/api/staff/sellers/${demoSellerId}`, { token: admin });
      assert.equal(r.status, 200);
      assert.equal(r.json.listings.length, 1);
      assert.equal(r.json.listings[0].distributor, 'Factory Direct');
      assert.equal(r.json.listings[0].sourceLabel, 'Direct from manufacturer');
      assert.equal(typeof r.json.earnings.availableCents, 'number');
      assert.ok(r.json.activity.some((a) => a.action === 'listing.created'));
      assert.equal((await t.api('/api/staff/sellers/not-a-uuid', { token: admin })).status, 404);
      assert.equal((await t.api('/api/staff/sellers/00000000-0000-4000-8000-000000000000', { token: admin })).status, 404);
    });

    it('suspends with a reason (required), shows it, and refuses double-suspend', async () => {
      const noReason = await t.api(`/api/staff/sellers/${demoSellerId}/suspend`, { method: 'POST', token: admin, body: {} });
      assert.equal(noReason.status, 400);
      const ok = await t.api(`/api/staff/sellers/${demoSellerId}/suspend`, { method: 'POST', token: admin, body: { reason: 'Counterfeit report' } });
      assert.equal(ok.status, 200);
      assert.equal(ok.json.status, 'suspended');
      assert.equal(ok.json.suspendedReason, 'Counterfeit report');
      assert.equal((await t.api(`/api/staff/sellers/${demoSellerId}/suspend`, { method: 'POST', token: admin, body: { reason: 'again' } })).status, 409);
      // their offer leaves the shop and shows as "seller_suspended" to staff
      const l = await t.api(`/api/staff/listings?sellerId=${demoSellerId}`, { token: admin });
      assert.equal(l.json.items[0].status, 'seller_suspended');
      assert.equal((await t.api(`/api/staff/listings?status=seller_suspended`, { token: admin })).json.total, 1);
      assert.equal((await t.api(`/api/products/${productId}`)).json.listings.length, 0);
      assert.equal((await t.api('/api/seller/dashboard', { token: seller })).status, 403);
    });

    it('reinstates and the offer returns', async () => {
      const ok = await t.api(`/api/staff/sellers/${demoSellerId}/reinstate`, { method: 'POST', token: admin, body: {} });
      assert.equal(ok.json.status, 'active');
      assert.equal(ok.json.suspendedReason, null);
      assert.equal((await t.api(`/api/staff/sellers/${demoSellerId}/reinstate`, { method: 'POST', token: admin, body: {} })).status, 409);
      assert.equal((await t.api(`/api/products/${productId}`)).json.listings.length, 1);
    });
  });

  describe('offers', () => {
    it('lists every seller\'s offers with the full transparency fields and filters', async () => {
      const r = await t.api('/api/staff/listings', { token: admin });
      assert.equal(r.json.total, 1);
      const l = r.json.items[0];
      assert.equal(l.sellerName, 'Demo Seller');
      assert.equal(l.priceCents, 5000);
      assert.equal(l.quantityAvailable, 3);
      assert.equal(l.sourceType, 'manufacturer_direct');
      assert.equal(l.distributor, 'Factory Direct');
      assert.equal(l.packaging, 'loose');
      assert.equal(l.status, 'live');
      assert.equal((await t.api('/api/staff/listings?q=factory', { token: admin })).json.total, 1); // distributor search
      assert.equal((await t.api('/api/staff/listings?q=zzzz', { token: admin })).json.total, 0);
      assert.equal((await t.api(`/api/staff/listings?productId=${productId}`, { token: admin })).json.total, 1);
      assert.equal((await t.api('/api/staff/listings?status=paused', { token: admin })).json.total, 0);
      assert.equal((await t.api('/api/staff/listings?status=bogus', { token: admin })).status, 400);
    });

    it('holds with a reason, refuses double-hold, and releases', async () => {
      assert.equal((await t.api(`/api/staff/listings/${listingId}/hold`, { method: 'POST', token: admin, body: {} })).status, 400);
      const hold = await t.api(`/api/staff/listings/${listingId}/hold`, { method: 'POST', token: admin, body: { reason: 'Photo mismatch' } });
      assert.equal(hold.json.status, 'on_hold');
      assert.equal(hold.json.adminHoldReason, 'Photo mismatch');
      assert.equal((await t.api(`/api/staff/listings/${listingId}/hold`, { method: 'POST', token: admin, body: { reason: 'again' } })).status, 409);
      assert.equal((await t.api('/api/staff/listings?status=on_hold', { token: admin })).json.total, 1);
      const rel = await t.api(`/api/staff/listings/${listingId}/release`, { method: 'POST', token: admin, body: {} });
      assert.equal(rel.json.status, 'live');
      assert.equal(rel.json.adminHoldReason, null);
      assert.equal((await t.api(`/api/staff/listings/${listingId}/release`, { method: 'POST', token: admin, body: {} })).status, 409);
      assert.equal((await t.api('/api/staff/listings/not-a-uuid/hold', { method: 'POST', token: admin, body: { reason: 'xxx' } })).status, 404);
    });

    it('sold-out offers are not shown to shoppers', async () => {
      await t.api(`/api/seller/listings/${listingId}`, { method: 'PATCH', token: seller, body: { quantityAvailable: 0 } });
      assert.equal((await t.api('/api/staff/listings?status=sold_out', { token: admin })).json.total, 1);
      assert.equal((await t.api(`/api/products/${productId}`)).json.listings.length, 0);
      await t.api(`/api/seller/listings/${listingId}`, { method: 'PATCH', token: seller, body: { quantityAvailable: 3 } });
    });
  });

  describe('users', () => {
    let buyerId;
    it('lists and searches accounts', async () => {
      const r = await t.api('/api/staff/users?q=buyer', { token: admin });
      assert.equal(r.json.items.length, 1);
      buyerId = r.json.items[0].id;
      assert.equal(r.json.items[0].isSeller, false);
      assert.equal(r.json.items[0].email, 'buyer@tsm.test');
      const sellers = (await t.api('/api/staff/users?limit=200', { token: admin })).json.items.filter((u) => u.isSeller);
      assert.equal(sellers.length, 6);
      assert.ok(!('passwordHash' in r.json.items[0]) && !('password_hash' in r.json.items[0]));
    });

    it('opening a person\'s details is written to the audit log', async () => {
      const r = await t.api(`/api/staff/users/${buyerId}`, { token: admin });
      assert.equal(r.status, 200);
      assert.equal(r.json.username.length > 0, true);
      assert.ok(JSON.stringify(r.json).indexOf('password') === -1);
      const log = await t.api('/api/staff/audit?action=staff.user_viewed', { token: admin });
      assert.equal(log.json.items[0].entityId, buyerId);
      assert.equal(log.json.items[0].actorName, 'TSM Admin');
    });

    it('suspending an account blocks it immediately, even with a token already issued', async () => {
      const token = await t.login('buyer@tsm.test', DEMO_PASSWORD);
      assert.equal((await t.api('/api/me', { token })).status, 200);
      assert.equal((await t.api(`/api/staff/users/${buyerId}/suspend`, { method: 'POST', token: admin, body: { reason: 'Chargeback fraud' } })).status, 200);
      assert.equal((await t.api('/api/me', { token })).status, 401);
      const relog = await t.api('/api/auth/login', { method: 'POST', body: { login: 'buyer@tsm.test', password: DEMO_PASSWORD } });
      assert.notEqual(relog.status, 200);
      assert.equal((await t.api(`/api/staff/users/${buyerId}/suspend`, { method: 'POST', token: admin, body: { reason: 'again' } })).status, 409);
      assert.equal((await t.api('/api/staff/users?status=suspended', { token: admin })).json.total, 1);
    });

    it('reinstating restores access', async () => {
      assert.equal((await t.api(`/api/staff/users/${buyerId}/reinstate`, { method: 'POST', token: admin, body: {} })).status, 200);
      assert.equal((await t.api('/api/auth/login', { method: 'POST', body: { login: 'buyer@tsm.test', password: DEMO_PASSWORD } })).status, 200);
      assert.equal((await t.api(`/api/staff/users/${buyerId}/reinstate`, { method: 'POST', token: admin, body: {} })).status, 409);
    });
  });

  describe('dashboard', () => {
    it('counts people, sellers, applications, catalog, offers and money', async () => {
      const d = (await t.api('/api/staff/dashboard', { token: admin })).json;
      assert.equal(d.sellers.total, 6);
      assert.equal(d.sellers.active, 6);
      assert.equal(d.applications.waiting, 1); // the seeded applicant
      assert.ok(d.people.total >= 8);
      assert.equal(d.products.total, 29);
      assert.equal(d.products.ready, 1); // only the one we finished
      assert.equal(d.listings.total, 1);
      assert.equal(d.listings.live, 1);
      assert.equal(d.listings.unitsInStock, 3);
      assert.equal(d.listings.inventoryValueCents, 15000);
      assert.ok(d.money.availableCents > 0);
      assert.equal(d.money.pendingPayouts, 1); // seeded pending demo payout
      assert.ok(d.recentActivity.length > 0 && d.recentActivity.length <= 12);
      assert.ok(d.recentActivity.every((a, i, arr) => i === 0 || a.id < arr[i - 1].id)); // newest first
    });

    it('agrees with the seller catalog on what "ready" means', async () => {
      const d = (await t.api('/api/staff/dashboard', { token: admin })).json;
      const cat = await t.api('/api/seller/catalog?limit=200', { token: seller });
      assert.equal(cat.json.total, d.products.ready);
    });
  });

  describe('audit log', () => {
    it('filters by actor type, action, entity and free text', async () => {
      const staffOnly = await t.api('/api/staff/audit?actorType=staff&limit=500', { token: admin });
      assert.ok(staffOnly.json.items.length > 0 && staffOnly.json.items.every((a) => a.actorType === 'staff'));
      const users = await t.api('/api/staff/audit?actorType=user&limit=500', { token: admin });
      assert.ok(users.json.items.some((a) => a.action === 'listing.created'));
      assert.ok(users.json.items.every((a) => a.actorType === 'user'));
      const byAction = await t.api('/api/staff/audit?action=seller.suspended', { token: admin });
      assert.equal(byAction.json.total, 1);
      assert.equal(byAction.json.items[0].details.reason, 'Counterfeit report');
      const byEntity = await t.api(`/api/staff/audit?entityType=seller&q=${demoSellerId}`, { token: admin });
      assert.ok(byEntity.json.items.length >= 2); // suspended + reinstated
      const text = await t.api('/api/staff/audit?q=Counterfeit', { token: admin });
      assert.equal(text.json.total, 1);
      assert.equal((await t.api('/api/staff/audit?q=%25_%25', { token: admin })).json.total, 0); // wildcards are literal
    });

    it('filters by date range and pages', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const now = await t.api(`/api/staff/audit?from=${today}&to=${today}&limit=5`, { token: admin });
      assert.equal(now.json.items.length, 5);
      assert.ok(now.json.total > 5);
      const next = await t.api(`/api/staff/audit?from=${today}&to=${today}&limit=5&offset=5`, { token: admin });
      assert.notEqual(next.json.items[0].id, now.json.items[0].id);
      const future = await t.api('/api/staff/audit?from=2999-01-01', { token: admin });
      assert.equal(future.json.total, 0);
      assert.equal((await t.api('/api/staff/audit?limit=9999', { token: admin })).status, 400);
      assert.equal((await t.api('/api/staff/audit?actorType=robot', { token: admin })).status, 400);
    });

    it('lists the names that exist for the filter menus', async () => {
      const f = (await t.api('/api/staff/audit/filters', { token: admin })).json;
      assert.ok(f.actions.includes('seller.suspended'));
      assert.ok(f.entityTypes.includes('listing'));
    });
  });
});
