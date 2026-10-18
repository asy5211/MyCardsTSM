import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { decryptJson } from '../src/lib/crypto.js';
import { recordSaleEarning } from '../src/lib/earnings.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';
import { auditCount, looseOffer, newUser, offer, readyProducts } from './v4-helpers.js';

const DAY = 86_400_000;
const dayKey = (d) => d.toISOString().slice(0, 10);

describe('seller business: sales rates, payout method, product filters', () => {
  let t;
  let admin;
  let support;
  let seller;
  let hub;
  let hubId;
  let sellerId;
  let buyer;
  let products;

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
    sellerId = (await t.api('/api/seller/me', { token: seller })).json.id;
    hubId = (await t.api('/api/seller/me', { token: hub })).json.id;
    buyer = await newUser(t, 'buyer', { address: true });
    products = await readyProducts(t, admin, 4);
    await pool.query('DELETE FROM listings');
    await pool.query('DELETE FROM seller_earnings');
    await pool.query('DELETE FROM payouts');
  });
  after(() => t.stop());

  describe('sales per day, week and month', () => {
    const when = (daysAgo, hour = 10) => {
      const d = new Date(Date.now() - daysAgo * DAY);
      d.setUTCHours(hour, 0, 0, 0);
      return d;
    };
    const stats = (query, token = hub) => t.api(`/api/seller/stats${query}`, { token });

    before(async () => {
      // three sales at the default 5% / 0%: now-ish, 2 days ago, 20 days ago
      const sales = [
        { ref: 'ORD-A', qty: 2, unit: 10000, at: new Date() },
        { ref: 'ORD-B', qty: 1, unit: 5000, at: when(2) },
        { ref: 'ORD-C', qty: 3, unit: 2000, at: when(20) },
      ];
      for (const s of sales) {
        const e = await recordSaleEarning({ sellerId: hubId, productName: 'Test Pack', orderRef: s.ref, quantity: s.qty, unitPriceCents: s.unit, bps: 500, processingBps: 100 });
        await pool.query('UPDATE seller_earnings SET created_at = ? WHERE id = ?', [s.at, e.id]);
      }
      // a payout that was paid 2 days ago
      await pool.query(
        "INSERT INTO payouts (id, seller_id, amount_cents, earnings_count, status, paid_at) VALUES (UUID(), ?, 4700, 1, 'paid', ?)",
        [hubId, when(2, 15)],
      );
    });

    it('needs an approved seller', async () => {
      assert.equal((await t.api('/api/seller/stats')).status, 401);
      assert.equal((await stats('', buyer.token)).status, 403);
    });

    it('shows the last 14 days, one bar per day, ending today', async () => {
      const r = await stats('?period=day');
      assert.equal(r.status, 200);
      assert.equal(r.json.period, 'day');
      assert.equal(r.json.count, 14);
      assert.equal(r.json.buckets.length, 14);
      assert.equal(r.json.buckets.at(-1).start, dayKey(new Date()));
      assert.equal(r.json.buckets[0].start, dayKey(new Date(Date.now() - 13 * DAY)));
      const today = r.json.buckets.at(-1);
      assert.equal(today.orders, 1);
      assert.equal(today.units, 2);
      assert.equal(today.grossCents, 20000);
      assert.equal(today.tsmFeeCents, 1000); // 5%
      assert.equal(today.processingFeeCents, 200); // 1%
      assert.equal(today.netCents, 18800);
      const earlier = r.json.buckets.find((b) => b.start === dayKey(when(2)));
      assert.equal(earlier.grossCents, 5000);
      assert.equal(earlier.paidOutCents, 4700);
      // the sale 20 days ago is outside a 14-day window
      assert.equal(r.json.totals.grossCents, 25000);
      assert.equal(r.json.totals.orders, 2);
      assert.equal(r.json.totals.paidOutCents, 4700);
      assert.deepEqual(r.json.averages, { grossCents: Math.round(25000 / 14), netCents: Math.round((18800 + 4700) / 14), orders: Number((2 / 14).toFixed(2)) });
      assert.deepEqual(r.json.fees, { tsmFeeBps: 500, processingFeeBps: 0, totalBps: 500 });
    });

    it('shows weeks starting on Monday', async () => {
      const r = await stats('?period=week');
      assert.equal(r.json.count, 12);
      assert.equal(r.json.buckets.length, 12);
      for (const b of r.json.buckets) assert.equal(new Date(b.start).getUTCDay(), 1);
      const gaps = r.json.buckets.slice(1).map((b, i) => (new Date(b.start) - new Date(r.json.buckets[i].start)) / DAY);
      assert.deepEqual(gaps, Array(11).fill(7));
      assert.equal(r.json.totals.grossCents, 20000 + 5000 + 6000); // all three sales fall in 12 weeks
      assert.equal(r.json.totals.orders, 3);
      const lastMonday = r.json.buckets.at(-1).start;
      assert.ok(new Date(lastMonday) <= new Date() && new Date() - new Date(lastMonday) < 7 * DAY);
    });

    it('shows months starting on the 1st', async () => {
      const r = await stats('?period=month&count=6');
      assert.equal(r.json.count, 6);
      assert.equal(r.json.buckets.length, 6);
      for (const b of r.json.buckets) assert.match(b.start, /^\d{4}-\d{2}-01$/);
      const now = new Date();
      assert.equal(r.json.buckets.at(-1).start, `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`);
      assert.equal(r.json.totals.grossCents, 31000);
      assert.equal(r.json.totals.tsmFeeCents, 1550); // 5% of 31,000
      assert.equal(r.json.totals.processingFeeCents, 310); // 1% of 31,000
    });

    it('limits how far back you can look and checks the options', async () => {
      assert.equal((await stats('?period=day&count=500')).json.count, 90);
      assert.equal((await stats('?period=week&count=500')).json.count, 52);
      assert.equal((await stats('?period=month&count=500')).json.count, 24);
      assert.equal((await stats('?period=year')).status, 400);
      assert.equal((await stats('?count=0')).status, 400);
      assert.equal((await stats('')).json.period, 'day'); // the default
    });

    it("only counts the signed-in seller's own sales", async () => {
      const r = await stats('?period=month', seller);
      assert.equal(r.json.totals.grossCents, 0);
      assert.equal(r.json.totals.paidOutCents, 0);
    });

    it('leaves out sales that were reversed', async () => {
      await pool.query("UPDATE seller_earnings SET status = 'reversed' WHERE order_ref = 'ORD-C'");
      assert.equal((await stats('?period=month&count=6')).json.totals.grossCents, 25000);
      await pool.query("UPDATE seller_earnings SET status = 'available' WHERE order_ref = 'ORD-C'");
    });
  });

  describe('where TSM pays the seller', () => {
    const put = (body, token = hub) => t.api('/api/seller/payout-method', { method: 'PUT', token, body });
    const bank = { type: 'bank_transfer', accountHolder: 'Collector Hub LLC', routingNumber: '021000021', accountNumber: '000123456789' };

    it('is empty to start with, and only for approved sellers', async () => {
      const r = await t.api('/api/seller/payout-method', { token: hub });
      assert.equal(r.status, 200);
      assert.equal(r.json.method, null);
      assert.equal((await t.api('/api/seller/payout-method', { token: buyer.token })).status, 403);
      assert.equal((await t.api('/api/seller/payout-method')).status, 401);
    });

    it('checks a bank account (routing number check digit, account digits)', async () => {
      const badRouting = await put({ ...bank, routingNumber: '123456789' });
      assert.equal(badRouting.status, 400);
      assert.ok(badRouting.json.error.details.some((d) => d.field === 'routingNumber'));
      assert.equal((await put({ ...bank, routingNumber: '12345' })).status, 400);
      assert.equal((await put({ ...bank, accountNumber: '12' })).status, 400);
      assert.equal((await put({ ...bank, accountNumber: '12ab5678' })).status, 400);
      assert.equal((await put({ ...bank, accountHolder: '' })).status, 400);
      assert.equal((await put({ type: 'cash', accountHolder: 'Someone' })).status, 400);
    });

    it('saves it and shows only a masked label back', async () => {
      const r = await put(bank);
      assert.equal(r.status, 200);
      assert.deepEqual({ type: r.json.method.type, holder: r.json.method.accountHolder, label: r.json.method.label }, { type: 'bank_transfer', holder: 'Collector Hub LLC', label: 'Bank account ending 6789' });
      const text = JSON.stringify((await t.api('/api/seller/payout-method', { token: hub })).json);
      assert.ok(!text.includes('021000021'));
      assert.ok(!text.includes('000123456789'));
    });

    it('stores the details encrypted, readable only with the seller’s own key', async () => {
      const [[row]] = await pool.query('SELECT * FROM seller_payout_methods WHERE seller_id = ?', [hubId]);
      const raw = row.details_enc.toString('latin1');
      assert.ok(!raw.includes('021000021'));
      assert.ok(!raw.includes('123456789'));
      assert.deepEqual(decryptJson(row.details_enc, hubId), { routingNumber: '021000021', accountNumber: '000123456789' });
      assert.throws(() => decryptJson(row.details_enc, sellerId)); // another seller's id cannot open it
    });

    it('keeps the account number out of the activity log', async () => {
      const [rows] = await pool.query("SELECT details FROM audit_logs WHERE action = 'seller.payout_method_saved'");
      assert.ok(rows.length >= 1);
      assert.ok(!JSON.stringify(rows).includes('123456789'));
      assert.ok(JSON.stringify(rows).includes('Bank account ending 6789'));
    });

    it('lets an admin see the real details, and logs every look', async () => {
      assert.equal((await t.api(`/api/staff/sellers/${hubId}/payout-method`)).status, 401);
      assert.equal((await t.api(`/api/staff/sellers/${hubId}/payout-method`, { token: support })).status, 403); // support staff cannot
      const before = await auditCount('seller.payout_method_viewed', hubId);
      const r = await t.api(`/api/staff/sellers/${hubId}/payout-method`, { token: admin });
      assert.equal(r.status, 200);
      assert.equal(r.json.method.details.routingNumber, '021000021');
      assert.equal(r.json.method.details.accountNumber, '000123456789');
      assert.equal(r.json.method.label, 'Bank account ending 6789');
      assert.equal(await auditCount('seller.payout_method_viewed', hubId), before + 1);
      assert.equal((await t.api(`/api/staff/sellers/${sellerId}/payout-method`, { token: admin })).json.method, null);
      assert.equal((await t.api('/api/staff/sellers/not-an-id/payout-method', { token: admin })).status, 404);
    });

    it('shows only the masked label on the staff seller page (support staff included)', async () => {
      const before = await auditCount('seller.payout_method_viewed', hubId);
      const page = await t.api(`/api/staff/sellers/${hubId}`, { token: support });
      assert.equal(page.status, 200);
      assert.equal(page.json.payoutMethod.label, 'Bank account ending 6789');
      assert.equal(page.json.payoutMethod.type, 'bank_transfer');
      assert.ok(!JSON.stringify(page.json).includes('123456789'));
      assert.equal(await auditCount('seller.payout_method_viewed', hubId), before); // masked text is not a "reveal"
      assert.equal((await t.api(`/api/staff/sellers/${sellerId}`, { token: support })).json.payoutMethod, null);
    });

    it('shows the masked method in the staff payouts overview', async () => {
      const r = await t.api('/api/staff/payouts/overview', { token: support });
      assert.equal(r.status, 200);
      const row = r.json.sellers.find((s) => s.sellerId === hubId);
      assert.equal(row.payoutMethod, 'Bank account ending 6789');
      assert.equal(r.json.sellers.find((s) => s.sellerId === sellerId).payoutMethod, null);
      assert.ok(!JSON.stringify(r.json).includes('000123456789'));
    });

    it('supports PayPal, Zelle and a paper check, replacing the old method each time', async () => {
      const paypal = await put({ type: 'paypal', accountHolder: 'Collector Hub LLC', email: 'Jo@Example.com' });
      assert.equal(paypal.status, 200);
      assert.match(paypal.json.method.label, /^PayPal j\*+@example\.com$/);
      assert.equal((await put({ type: 'paypal', accountHolder: 'Collector Hub LLC', email: 'not-an-email' })).status, 400);

      const zellePhone = await put({ type: 'zelle', accountHolder: 'Collector Hub LLC', contact: '5551234567' });
      assert.equal(zellePhone.json.method.label, 'Zelle phone ending 4567');
      const zelleEmail = await put({ type: 'zelle', accountHolder: 'Collector Hub LLC', contact: 'pay@hub.example' });
      assert.match(zelleEmail.json.method.label, /^Zelle p\*+@hub\.example$/);
      const badZelle = await put({ type: 'zelle', accountHolder: 'Collector Hub LLC', contact: 'abcdefg' });
      assert.equal(badZelle.status, 400);
      assert.ok(badZelle.json.error.details.some((d) => d.field === 'contact'));

      const check = { type: 'check', accountHolder: 'Collector Hub LLC', line1: '1 Main St', city: 'Columbus', region: 'oh', postalCode: '43004' };
      const ok = await put(check);
      assert.equal(ok.json.method.label, 'Paper check to Columbus, OH');
      assert.equal((await put({ ...check, region: 'Ohio' })).status, 400);
      assert.equal((await put({ ...check, postalCode: '1234' })).status, 400);
      const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM seller_payout_methods WHERE seller_id = ?', [hubId]);
      assert.equal(n, 1); // one method per seller
      const [[row]] = await pool.query('SELECT details_enc FROM seller_payout_methods WHERE seller_id = ?', [hubId]);
      assert.equal(decryptJson(row.details_enc, hubId).postalCode, '43004');
    });

    it('keeps each seller’s method private to them, and can be removed', async () => {
      assert.equal((await t.api('/api/seller/payout-method', { token: seller })).json.method, null);
      const gone = await t.api('/api/seller/payout-method', { method: 'DELETE', token: hub });
      assert.equal(gone.status, 204);
      assert.equal((await t.api('/api/seller/payout-method', { token: hub })).json.method, null);
      assert.equal(await auditCount('seller.payout_method_removed', hubId), 1);
    });
  });

  describe('seller dashboard numbers', () => {
    it('shows the fees taken before payout and how many orders need shipping', async () => {
      const a = await looseOffer(t, hub, products[0], { priceCents: 10000 });
      assert.equal((await t.api('/api/staff/settings/fees', { method: 'PUT', token: admin, body: { processingFeeBps: 290 } })).status, 200);
      const bought = await t.api('/api/orders', { method: 'POST', token: buyer.token, body: { items: [{ listingId: a.id, quantity: 1 }] } });
      assert.equal(bought.status, 201);

      const dash = await t.api('/api/seller/dashboard', { token: hub });
      assert.equal(dash.status, 200);
      assert.equal(dash.json.ordersToShip, 1);
      assert.deepEqual(dash.json.fees, { tsmFeeBps: 500, processingFeeBps: 290, totalBps: 790 });
      assert.equal(dash.json.recentSales[0].commissionCents, 500);
      assert.equal(dash.json.recentSales[0].processingFeeCents, 290);
      assert.equal(dash.json.recentSales[0].netCents, 9210);
      assert.ok(dash.json.money.processingFeeCents >= 290);

      const me = await t.api('/api/seller/me', { token: hub });
      assert.deepEqual(me.json.fees, { tsmFeeBps: 500, processingFeeBps: 290, totalBps: 790 });
      const earnings = await t.api('/api/seller/earnings', { token: hub });
      assert.deepEqual(earnings.json.fees, { tsmFeeBps: 500, processingFeeBps: 290, totalBps: 790 });
      const latest = earnings.json.items.find((e) => e.orderRef === bought.json.orders[0].orderNumber);
      assert.equal(latest.processingFeeBps, 290);
    });
  });

  describe('finding products in my own list', () => {
    let rows; // [{id, productId, brandId, typeId}]
    const meta = async (productId) => (await pool.query('SELECT brand_id, product_type_id FROM products WHERE id = ?', [productId]))[0][0];
    const ids = async (query) => (await t.api(`/api/seller/listings${query}`, { token: seller })).json.items.map((l) => l.id).sort();

    before(async () => {
      rows = [];
      for (const [i, productId] of products.entries()) {
        const l = i % 2 === 0
          ? await offer(t, seller, productId, { boxNumber: 1, boxesInCase: 12, quantityAvailable: 3 })
          : await looseOffer(t, seller, productId);
        const m = await meta(productId);
        rows.push({ id: l.id, productId, brandId: m.brand_id, typeId: m.product_type_id });
      }
      // make one paused and one sold out
      await t.api(`/api/seller/listings/${rows[1].id}`, { method: 'PATCH', token: seller, body: { isActive: false } });
      await t.api(`/api/seller/listings/${rows[2].id}`, { method: 'PATCH', token: seller, body: { quantityAvailable: 0 } });
    });

    it('filters by status', async () => {
      assert.deepEqual(await ids('?status=paused'), [rows[1].id]);
      assert.deepEqual(await ids('?status=sold_out'), [rows[2].id]);
      assert.deepEqual(await ids('?status=live'), [rows[0].id, rows[3].id].sort());
      assert.equal((await ids('?status=all')).length, 4);
      assert.equal((await t.api('/api/seller/listings?status=bogus', { token: seller })).status, 400);
    });

    it('filters by brand and by type', async () => {
      for (const brandId of new Set(rows.map((r) => r.brandId))) {
        assert.deepEqual(await ids(`?brandId=${brandId}`), rows.filter((r) => r.brandId === brandId).map((r) => r.id).sort());
      }
      for (const typeId of new Set(rows.map((r) => r.typeId))) {
        assert.deepEqual(await ids(`?typeId=${typeId}`), rows.filter((r) => r.typeId === typeId).map((r) => r.id).sort());
      }
      assert.deepEqual(await ids('?brandId=00000000-0000-4000-8000-000000000000'), []);
      assert.equal((await t.api('/api/seller/listings?brandId=nope', { token: seller })).status, 400);
    });

    it('combines filters and keeps the total right', async () => {
      const { brandId } = rows[0];
      const expected = rows.filter((r) => r.brandId === brandId && [rows[0].id, rows[3].id].includes(r.id)).map((r) => r.id).sort();
      const r = await t.api(`/api/seller/listings?brandId=${brandId}&status=live`, { token: seller });
      assert.deepEqual(r.json.items.map((l) => l.id).sort(), expected);
      assert.equal(r.json.total, expected.length);
      const paged = await t.api('/api/seller/listings?limit=1&offset=1', { token: seller });
      assert.equal(paged.json.items.length, 1);
      assert.equal(paged.json.total, 4);
    });

    it('searches by product, brand or distributor name', async () => {
      const one = (await t.api(`/api/seller/listings/${rows[0].id}`, { token: seller })).json;
      const found = await ids(`?q=${encodeURIComponent(one.productName.slice(0, 10))}`);
      assert.ok(found.includes(rows[0].id));
      assert.equal((await ids('?q=Card%20Depot')).length, 4);
      assert.deepEqual(await ids('?q=%25'), []); // a % is not a wildcard
    });

    it('has brand and type lists for the filter menus, and says which brand and type each catalog product has', async () => {
      const brands = await t.api('/api/brands');
      const types = await t.api('/api/product-types');
      assert.equal(brands.status, 200);
      assert.equal(types.status, 200);
      const catalog = await t.api('/api/seller/catalog?limit=5', { token: seller });
      const first = catalog.json.items[0];
      assert.ok(brands.json.some((b) => b.id === first.brand.id));
      assert.ok(types.json.some((x) => x.id === first.type.id));
    });
  });
});
