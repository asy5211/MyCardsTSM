import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { DEMO_PASSWORD, makeReady, startServer } from './helpers.js';

describe('seller portal', () => {
  let t;
  let admin;
  let seller; // seller@tsm.test (approved)
  let hub; // hub@tsm.test (approved, another seller)
  let buyer;
  let applicant;
  let readyId; // a product staff finished
  let rawId; // a product staff has NOT finished (no photo)

  const goodCase = (productId, over = {}) => ({
    productId, priceCents: 12999, quantityAvailable: 6, sourceType: 'distributor', distributor: 'Card Depot',
    packaging: 'case', boxNumber: 3, boxesInCase: 12, ...over,
  });
  const goodLoose = (productId, over = {}) => ({
    productId, priceCents: 4999, quantityAvailable: 20, sourceType: 'retail_store', distributor: 'Target Clearance', packaging: 'loose', ...over,
  });
  const fieldsOf = (r) => (r.json.error.details ?? []).map((d) => d.field).sort();

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    seller = await t.login('seller@tsm.test', DEMO_PASSWORD);
    hub = await t.login('hub@tsm.test', DEMO_PASSWORD);
    buyer = await t.login('buyer@tsm.test', DEMO_PASSWORD);
    applicant = await t.login('applicant@tsm.test', DEMO_PASSWORD);

    // Start from a clean slate: the tests below create their own offers.
    await pool.query('DELETE FROM listings');
    const list = await t.api('/api/staff/products?limit=5', { token: admin });
    readyId = list.json.items[0].id;
    rawId = list.json.items[1].id;
    await makeReady(t, admin, readyId);
    await pool.query("UPDATE products SET description = NULL, thumbnail_key = NULL WHERE id = ?", [rawId]);
    await pool.query('DELETE FROM product_images WHERE product_id = ?', [rawId]);
  });
  after(() => t.stop());

  describe('who gets in', () => {
    it('refuses anonymous callers', async () => {
      assert.equal((await t.api('/api/seller/me')).status, 401);
      assert.equal((await t.api('/api/seller/listings')).status, 401);
    });

    it('refuses signed-in customers who are not approved sellers', async () => {
      for (const token of [buyer, applicant]) {
        const r = await t.api('/api/seller/me', { token });
        assert.equal(r.status, 403);
        assert.equal(r.json.error.code, 'not_a_seller');
        assert.equal((await t.api('/api/seller/listings', { method: 'POST', token, body: goodLoose(readyId) })).status, 403);
      }
    });

    it('refuses staff tokens (staff and sellers are different logins)', async () => {
      assert.equal((await t.api('/api/seller/me', { token: admin })).status, 401);
    });

    it('lets someone in only after staff approve their application', async () => {
      const apps = await t.api('/api/staff/seller-applications?status=submitted', { token: admin });
      const mine = apps.json.items.find((a) => a.businessName === 'Lone Star Cards LLC');
      assert.ok(mine, 'seeded applicant application should be waiting');
      assert.equal((await t.api('/api/seller/me', { token: applicant })).status, 403);
      const ok = await t.api(`/api/staff/seller-applications/${mine.id}/approve`, { method: 'POST', token: admin, body: {} });
      assert.equal(ok.status, 200);
      const me = await t.api('/api/seller/me', { token: applicant });
      assert.equal(me.status, 200);
      assert.equal(me.json.displayName, 'Lone Star Cards LLC');
      // The distributors they named on the application are offered as suggestions.
      assert.deepEqual(me.json.distributors, ['Southeast Card Distribution', 'Pacific Hobby Wholesale']);
      assert.equal(me.json.commissionBps, 500);
      assert.deepEqual(me.json.fees, { tsmFeeBps: 500, processingFeeBps: 0, totalBps: 500 });
    });

    it('locks a suspended seller out immediately, and lets them back after reinstating', async () => {
      const found = await t.api('/api/staff/sellers?q=Collector', { token: admin });
      const id = found.json.items[0].id;
      assert.equal((await t.api(`/api/staff/sellers/${id}/suspend`, { method: 'POST', token: admin, body: { reason: 'Testing' } })).status, 200);
      const r = await t.api('/api/seller/me', { token: hub });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'seller_suspended');
      assert.equal((await t.api(`/api/staff/sellers/${id}/reinstate`, { method: 'POST', token: admin, body: {} })).status, 200);
      assert.equal((await t.api('/api/seller/me', { token: hub })).status, 200);
    });
  });

  describe('the catalog sellers pick from', () => {
    it('only lists products staff finished (description + main photo)', async () => {
      const r = await t.api('/api/seller/catalog?limit=200', { token: seller });
      assert.equal(r.status, 200);
      const ids = r.json.items.map((p) => p.id);
      assert.ok(ids.includes(readyId));
      assert.ok(!ids.includes(rawId));
      const mine = r.json.items.find((p) => p.id === readyId);
      assert.match(mine.thumbnailUrl, /^\/media\/products\//);
      assert.ok(mine.description.length >= 10);
      assert.equal(mine.myListingCount, 0);
      // consistent with what staff see as "ready"
      const staff = await t.api('/api/staff/products?status=active&limit=200', { token: admin });
      assert.equal(r.json.total, staff.json.items.filter((p) => p.isReady).length);
    });

    it('searches by product or brand name', async () => {
      const all = await t.api('/api/seller/catalog?limit=200', { token: seller });
      const first = all.json.items[0];
      const r = await t.api(`/api/seller/catalog?q=${encodeURIComponent(first.name.slice(0, 8))}`, { token: seller });
      assert.ok(r.json.items.some((p) => p.id === first.id));
      assert.equal((await t.api('/api/seller/catalog?q=%25%25%25_', { token: seller })).json.items.length, 0); // wildcards are not wildcards
    });
  });

  describe('listing a product', () => {
    it('creates an offer from a case with every transparency detail', async () => {
      const r = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: goodCase(readyId) });
      assert.equal(r.status, 201);
      assert.equal(r.json.priceCents, 12999);
      assert.equal(r.json.quantityAvailable, 6);
      assert.equal(r.json.sourceType, 'distributor');
      assert.equal(r.json.sourceLabel, 'Authorized distributor');
      assert.equal(r.json.distributor, 'Card Depot');
      assert.equal(r.json.packaging, 'case');
      assert.equal(r.json.boxPosition, 'Box 3 of 12');
      assert.equal(r.json.boxNumber, 3);
      assert.equal(r.json.boxesInCase, 12);
      assert.equal(r.json.status, 'live');
      assert.equal(r.json.sellerName, 'Demo Seller');
    });

    it('shows the new offer to shoppers with the same transparency details', async () => {
      const r = await t.api(`/api/products/${readyId}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.listings.length, 1);
      const l = r.json.listings[0];
      assert.equal(l.boxPosition, 'Box 3 of 12');
      assert.equal(l.distributor, 'Card Depot');
      assert.equal(l.sourceLabel, 'Authorized distributor');
      assert.equal(l.boxNumber, 3);
      assert.equal(l.boxesInCase, 12);
      assert.equal(l.quantityAvailable, 6);
    });

    it('creates a loose-product offer (no box numbers)', async () => {
      const r = await t.api('/api/seller/listings', { method: 'POST', token: hub, body: goodLoose(readyId, { boxNumber: 4, boxesInCase: 8 }) });
      assert.equal(r.status, 201);
      assert.equal(r.json.packaging, 'loose');
      assert.equal(r.json.boxPosition, null);
      assert.equal(r.json.boxNumber, null); // ignored for loose product
      assert.equal(r.json.boxesInCase, null);
    });

    it('refuses a product staff have not finished', async () => {
      const r = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: goodLoose(rawId) });
      assert.equal(r.status, 400);
      assert.deepEqual(fieldsOf(r), ['productId']);
    });

    it('refuses a product that does not exist, or a missing product', async () => {
      const ghost = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: goodLoose('00000000-0000-4000-8000-000000000000') });
      assert.equal(ghost.status, 400);
      const none = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: { ...goodLoose(readyId), productId: undefined } });
      assert.equal(none.status, 400);
      assert.deepEqual(fieldsOf(none), ['productId']);
    });

    it('requires every transparency field', async () => {
      const r = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: { productId: readyId } });
      assert.equal(r.status, 400);
      assert.deepEqual(fieldsOf(r), ['distributor', 'packaging', 'priceCents', 'quantityAvailable', 'sourceType']);
    });

    it('checks price, stock, source and distributor', async () => {
      const bad = async (over, field) => {
        const r = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: goodLoose(readyId, over) });
        assert.equal(r.status, 400, `${field}: ${JSON.stringify(over)}`);
        assert.ok(fieldsOf(r).includes(field), `${field} missing in ${JSON.stringify(r.json.error.details)}`);
      };
      await bad({ priceCents: 0 }, 'priceCents');
      await bad({ priceCents: -5 }, 'priceCents');
      await bad({ priceCents: 19.99 }, 'priceCents'); // dollars by mistake
      await bad({ priceCents: 10_000_001 }, 'priceCents');
      await bad({ quantityAvailable: -1 }, 'quantityAvailable');
      await bad({ quantityAvailable: 2.5 }, 'quantityAvailable');
      await bad({ sourceType: 'my_garage' }, 'sourceType');
      await bad({ distributor: ' ' }, 'distributor');
      await bad({ distributor: 'x'.repeat(121) }, 'distributor');
      await bad({ packaging: 'pallet' }, 'packaging');
    });

    it('allows zero stock (listed but sold out)', async () => {
      const r = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: goodLoose(readyId, { quantityAvailable: 0, distributor: 'Zero Stock Inc' }) });
      assert.equal(r.status, 201);
      assert.equal(r.json.status, 'sold_out');
      await t.api(`/api/seller/listings/${r.json.id}`, { method: 'PATCH', token: seller, body: { isActive: false } });
    });

    it('a box from a case must say which box and how many are in the case', async () => {
      const noBox = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: goodCase(readyId, { boxNumber: undefined, boxesInCase: undefined }) });
      assert.equal(noBox.status, 400);
      assert.deepEqual(fieldsOf(noBox), ['boxNumber', 'boxesInCase']);
      const tooHigh = await t.api('/api/seller/listings', { method: 'POST', token: seller, body: goodCase(readyId, { boxNumber: 13, boxesInCase: 12 }) });
      assert.equal(tooHigh.status, 400);
      assert.deepEqual(fieldsOf(tooHigh), ['boxNumber']);
      assert.equal((await t.api('/api/seller/listings', { method: 'POST', token: seller, body: goodCase(readyId, { boxNumber: 0 }) })).status, 400);
    });

    it('trims the distributor name', async () => {
      const r = await t.api('/api/seller/listings', { method: 'POST', token: hub, body: goodLoose(readyId, { distributor: '  Acme Wholesale  ' }) });
      assert.equal(r.json.distributor, 'Acme Wholesale');
      await t.api(`/api/seller/listings/${r.json.id}`, { method: 'PATCH', token: hub, body: { isActive: false } });
    });
  });

  describe('managing my offers', () => {
    let mineId;
    let hubsId;

    before(async () => {
      mineId = (await t.api('/api/seller/listings?status=live', { token: seller })).json.items[0].id;
      hubsId = (await t.api('/api/seller/listings?status=live', { token: hub })).json.items[0].id;
    });

    it('lists only my own offers', async () => {
      const mine = await t.api('/api/seller/listings', { token: seller });
      assert.ok(mine.json.items.length >= 1);
      assert.ok(mine.json.items.every((l) => l.sellerName === 'Demo Seller'));
      assert.ok(!mine.json.items.some((l) => l.id === hubsId));
    });

    it("cannot see or edit another seller's offer", async () => {
      const r = await t.api(`/api/seller/listings/${hubsId}`, { method: 'PATCH', token: seller, body: { priceCents: 1 } });
      assert.equal(r.status, 404);
      const after = await pool.query('SELECT price FROM listings WHERE id = ?', [hubsId]);
      assert.notEqual(Number(after[0][0].price), 0.01);
      assert.equal((await t.api('/api/seller/listings/not-a-uuid', { method: 'PATCH', token: seller, body: { priceCents: 100 } })).status, 404);
    });

    it('opens one of my own offers, but not anyone else\'s', async () => {
      const r = await t.api(`/api/seller/listings/${mineId}`, { token: seller });
      assert.equal(r.status, 200);
      assert.equal(r.json.id, mineId);
      assert.equal(r.json.productName.length > 0, true);
      assert.equal((await t.api(`/api/seller/listings/${hubsId}`, { token: seller })).status, 404);
      assert.equal((await t.api('/api/seller/listings/not-a-uuid', { token: seller })).status, 404);
    });

    it('changes price and stock', async () => {
      const r = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { priceCents: 11500, quantityAvailable: 4 } });
      assert.equal(r.status, 200);
      assert.equal(r.json.priceCents, 11500);
      assert.equal(r.json.quantityAvailable, 4);
      assert.equal(r.json.boxPosition, 'Box 3 of 12'); // untouched
      assert.equal(r.json.distributor, 'Card Depot');
    });

    it('refuses an empty change and invalid values', async () => {
      assert.equal((await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: {} })).status, 400);
      const bad = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { priceCents: 0 } });
      assert.equal(bad.status, 400);
      const tooHigh = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { boxNumber: 20 } });
      assert.equal(tooHigh.status, 400); // 20 is more than the 12 boxes already in the case
    });

    it('switches between case and loose, re-checking the case details', async () => {
      const noBox = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { packaging: 'loose' } });
      assert.equal(noBox.status, 200);
      assert.equal(noBox.json.boxPosition, null);
      const needsBox = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { packaging: 'case' } });
      assert.equal(needsBox.status, 400);
      assert.deepEqual(fieldsOf(needsBox), ['boxNumber', 'boxesInCase']);
      const ok = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { packaging: 'case', boxNumber: 7, boxesInCase: 10 } });
      assert.equal(ok.json.boxPosition, 'Box 7 of 10');
    });

    it('pauses (hidden from shoppers) and resumes an offer', async () => {
      const paused = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { isActive: false } });
      assert.equal(paused.json.status, 'paused');
      const shop = await t.api(`/api/products/${readyId}`);
      assert.ok(!shop.json.listings.some((l) => l.id === mineId));
      const resumed = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { isActive: true } });
      assert.equal(resumed.json.status, 'live');
      assert.ok((await t.api(`/api/products/${readyId}`)).json.listings.some((l) => l.id === mineId));
    });

    it('filters my list by status', async () => {
      const paused = await t.api('/api/seller/listings?status=paused', { token: seller });
      assert.ok(paused.json.items.every((l) => l.status === 'paused'));
      assert.ok(paused.json.items.length >= 1); // the zero-stock one we paused earlier
      assert.equal((await t.api('/api/seller/listings?status=nope', { token: seller })).status, 400);
    });

    it('sets the price of an old demo offer that has no box number without being blocked', async () => {
      await pool.query("UPDATE listings SET box_number = NULL, boxes_in_case = NULL, box_position = NULL, source = 'From Case' WHERE id = ?", [mineId]);
      const r = await t.api(`/api/seller/listings/${mineId}`, { method: 'PATCH', token: seller, body: { priceCents: 9900 } });
      assert.equal(r.status, 200);
      assert.equal(r.json.priceCents, 9900);
      assert.equal(r.json.packaging, 'case');
    });
  });

  describe('admin holds', () => {
    let id;
    before(async () => {
      id = (await t.api('/api/seller/listings?status=live', { token: hub })).json.items[0].id;
    });

    it('a held offer is hidden from shoppers and the seller cannot resume it', async () => {
      const hold = await t.api(`/api/staff/listings/${id}/hold`, { method: 'POST', token: admin, body: { reason: 'Price looks wrong' } });
      assert.equal(hold.status, 200);
      assert.equal(hold.json.status, 'on_hold');
      const mine = await t.api('/api/seller/listings?status=on_hold', { token: hub });
      assert.equal(mine.json.items[0].adminHoldReason, 'Price looks wrong');
      assert.ok(!(await t.api(`/api/products/${readyId}`)).json.listings.some((l) => l.id === id));
      const resume = await t.api(`/api/seller/listings/${id}`, { method: 'PATCH', token: hub, body: { isActive: true } });
      assert.equal(resume.status, 403);
      assert.match(resume.json.error.message, /Price looks wrong/);
    });

    it('the seller can still correct the price while held, and staff can release it', async () => {
      assert.equal((await t.api(`/api/seller/listings/${id}`, { method: 'PATCH', token: hub, body: { priceCents: 4500 } })).status, 200);
      const rel = await t.api(`/api/staff/listings/${id}/release`, { method: 'POST', token: admin, body: {} });
      assert.equal(rel.json.status, 'live');
      assert.ok((await t.api(`/api/products/${readyId}`)).json.listings.some((l) => l.id === id));
    });
  });

  describe('seller suspended', () => {
    it("hides a suspended seller's offers from shoppers until reinstated", async () => {
      const mineBefore = (await t.api(`/api/products/${readyId}`)).json.listings.length;
      assert.ok(mineBefore >= 2);
      const found = await t.api('/api/staff/sellers?q=Demo%20Seller', { token: admin });
      const sid = found.json.items[0].id;
      await t.api(`/api/staff/sellers/${sid}/suspend`, { method: 'POST', token: admin, body: { reason: 'Review' } });
      const during = (await t.api(`/api/products/${readyId}`)).json.listings;
      assert.ok(during.length < mineBefore);
      assert.ok(!during.some((l) => l.seller === 'Demo Seller'));
      await t.api(`/api/staff/sellers/${sid}/reinstate`, { method: 'POST', token: admin, body: {} });
      assert.equal((await t.api(`/api/products/${readyId}`)).json.listings.length, mineBefore);
    });
  });

  describe('dashboard and audit trail', () => {
    it('summarises my offers and stock', async () => {
      const r = await t.api('/api/seller/dashboard', { token: seller });
      assert.equal(r.status, 200);
      const l = r.json.listings;
      assert.equal(l.total, l.live + l.paused + l.onHold + l.soldOut);
      assert.ok(l.unitsInStock >= 4);
      assert.ok(l.inventoryValueCents > 0);
      assert.ok(Array.isArray(r.json.recentSales));
      assert.equal(typeof r.json.money.availableCents, 'number');
    });

    it('records who created and changed each offer', async () => {
      const log = await t.api('/api/staff/audit?entityType=listing&limit=200', { token: admin });
      const actions = new Set(log.json.items.map((a) => a.action));
      for (const a of ['listing.created', 'listing.updated', 'listing.paused', 'listing.resumed']) assert.ok(actions.has(a), `missing ${a}`);
      const created = log.json.items.find((a) => a.action === 'listing.created');
      assert.equal(created.actorType, 'user');
      assert.ok(created.details.product);
      const priceChange = log.json.items.find((a) => a.details?.changes?.priceCents);
      assert.ok(priceChange, 'a price change should list before/after');
    });
  });
});
