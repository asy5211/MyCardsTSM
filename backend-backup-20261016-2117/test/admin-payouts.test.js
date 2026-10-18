import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { commissionCents, recordSaleEarning } from '../src/lib/earnings.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';

describe('admin: earnings and payouts', () => {
  let t;
  let admin;
  let support;
  let seller;
  let sellerId;
  let hub;
  let hubId;

  // These sales are written at the old 3% rate on purpose: the ledger remembers the rate each sale was made at,
  // and the numbers below were worked out at 3%. (Sales made through checkout use the live rate, 5% by default.)
  const earn = (sid, name, qty, unit, ref) =>
    recordSaleEarning({ sellerId: sid, productName: name, orderRef: ref, quantity: qty, unitPriceCents: unit, bps: 300 });
  const mine = async (token = seller) => (await t.api('/api/seller/earnings', { token })).json;

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
    // a clean ledger so the numbers below are exact
    await pool.query('DELETE FROM seller_earnings');
    await pool.query('DELETE FROM payouts');
  });
  after(() => t.stop());

  it('works out the commission to the cent (rounded half up)', () => {
    assert.equal(commissionCents(10000, 300), 300);
    assert.equal(commissionCents(14999, 300), 450); // 449.97 -> 450
    assert.equal(commissionCents(1, 300), 0);
    assert.equal(commissionCents(50, 300), 2); // 1.5 -> 2
    assert.equal(commissionCents(10000, 1000), 1000);
  });

  it('uses a flat 5% unless told otherwise', () => {
    assert.equal(config.commissionBps, 500);
    assert.equal(commissionCents(10000), 500);
    assert.equal(commissionCents(14999), 750); // 749.95 -> 750
  });

  it('takes the payment fee out of the seller\'s net, and remembers both rates on the sale', async () => {
    const e = await recordSaleEarning({ sellerId, productName: 'Fee check', orderRef: 'ORD-FEE-1', quantity: 1, unitPriceCents: 10000, bps: 500, processingBps: 290 });
    assert.deepEqual(e, { id: e.id, grossCents: 10000, commissionCents: 500, processingFeeCents: 290, netCents: 9210 });
    const [[row]] = await pool.query('SELECT commission_bps, processing_fee_bps, processing_fee_cents FROM seller_earnings WHERE id = ?', [e.id]);
    assert.equal(row.commission_bps, 500);
    assert.equal(row.processing_fee_bps, 290);
    assert.equal(row.processing_fee_cents, 290);
    await pool.query('DELETE FROM seller_earnings WHERE id = ?', [e.id]);
  });

  it('records a sale in the ledger with gross, commission and net adding up', async () => {
    const e = await earn(sellerId, 'Box A', 2, 14999, 'ORD-1001');
    assert.deepEqual(e, { id: e.id, grossCents: 29998, commissionCents: 900, processingFeeCents: 0, netCents: 29098 });
    await earn(sellerId, 'Box B', 1, 5000, 'ORD-1002');
    await earn(hubId, 'Box C', 3, 2000, 'ORD-1003');
    const m = await mine();
    assert.equal(m.items.length, 2);
    assert.equal(m.summary.availableCents, 29098 + 4850);
    assert.equal(m.summary.grossCents, 34998);
    assert.equal(m.summary.commissionCents, 900 + 150);
    assert.equal(m.summary.grossCents - m.summary.commissionCents, m.summary.availableCents);
    assert.equal(m.commissionBps, 500); // the live rate; these two sales keep the 3% they were made at
    assert.deepEqual(m.fees, { tsmFeeBps: 500, processingFeeBps: 0, totalBps: 500 });
    assert.equal(m.items[0].sellerId, sellerId);
  });

  it('keeps each seller\'s money private to them', async () => {
    const m = await mine(hub);
    assert.equal(m.items.length, 1);
    assert.equal(m.items[0].productName, 'Box C');
    assert.equal((await t.api('/api/seller/payouts', { token: hub })).json.items.length, 0);
  });

  it('shows the overview to staff, one row per seller, biggest balance first', async () => {
    const o = (await t.api('/api/staff/payouts/overview', { token: support })).json;
    assert.equal(o.sellers.length, 6);
    assert.equal(o.sellers[0].displayName, 'Demo Seller');
    assert.equal(o.sellers[0].availableCents, 33948);
    assert.equal(o.totals.availableCents, 33948 + 5820);
    const ledger = await t.api('/api/staff/earnings?limit=200', { token: support });
    assert.equal(ledger.json.total, 3);
    assert.equal((await t.api(`/api/staff/earnings?sellerId=${hubId}`, { token: support })).json.total, 1);
    assert.equal((await t.api('/api/staff/earnings?status=paid', { token: support })).json.total, 0);
  });

  it('support staff can look but not create, pay or cancel payouts', async () => {
    assert.equal((await t.api('/api/staff/payouts', { method: 'POST', token: support, body: { sellerId } })).status, 403);
    assert.equal((await t.api('/api/staff/payouts/00000000-0000-4000-8000-000000000000/mark-paid', { method: 'POST', token: support, body: { reference: 'ACH-1' } })).status, 403);
    assert.equal((await t.api('/api/staff/payouts/00000000-0000-4000-8000-000000000000/cancel', { method: 'POST', token: support, body: { reason: 'nope' } })).status, 403);
  });

  it('refuses a payout for an unknown seller, a bad id, or a seller with nothing available', async () => {
    assert.equal((await t.api('/api/staff/payouts', { method: 'POST', token: admin, body: {} })).status, 400);
    assert.equal((await t.api('/api/staff/payouts', { method: 'POST', token: admin, body: { sellerId: 'nope' } })).status, 400);
    assert.equal((await t.api('/api/staff/payouts', { method: 'POST', token: admin, body: { sellerId: '00000000-0000-4000-8000-000000000000' } })).status, 404);
    const eliteId = (await t.api('/api/staff/sellers?q=Elite', { token: admin })).json.items[0].id;
    assert.equal((await t.api('/api/staff/payouts', { method: 'POST', token: admin, body: { sellerId: eliteId } })).status, 409);
  });

  let payoutId;
  it('bundles all available sales into one pending payout', async () => {
    const r = await t.api('/api/staff/payouts', { method: 'POST', token: admin, body: { sellerId, note: 'October payout' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.status, 'pending');
    assert.equal(r.json.amountCents, 33948);
    assert.equal(r.json.earningsCount, 2);
    assert.equal(r.json.sellerName, 'Demo Seller');
    payoutId = r.json.id;

    const detail = (await t.api(`/api/staff/payouts/${payoutId}`, { token: support })).json;
    assert.equal(detail.earnings.length, 2);
    assert.ok(detail.earnings.every((e) => e.status === 'in_payout' && e.payoutId === payoutId));
    assert.equal(detail.earnings.reduce((s, e) => s + e.netCents, 0), detail.amountCents);

    const m = await mine();
    assert.equal(m.summary.availableCents, 0);
    assert.equal(m.summary.inPayoutCents, 33948);
    const sellerView = (await t.api('/api/seller/payouts', { token: seller })).json.items;
    assert.equal(sellerView.length, 1);
    assert.equal(sellerView[0].status, 'pending');
  });

  it('cannot be created twice for the same sales', async () => {
    const again = await t.api('/api/staff/payouts', { method: 'POST', token: admin, body: { sellerId } });
    assert.equal(again.status, 409);
  });

  it('many staff creating a payout at the same instant make exactly ONE (never pays a sale twice)', async () => {
    await pool.query('DELETE FROM seller_earnings WHERE seller_id = ?', [hubId]);
    await pool.query('DELETE FROM payouts WHERE seller_id = ?', [hubId]);
    for (let round = 1; round <= 4; round += 1) {
      await earn(hubId, `Race box ${round}`, 1, 10000, `ORD-RACE-${round}`);
      const results = await Promise.all(Array.from({ length: 20 }, () => t.api('/api/staff/payouts', { method: 'POST', token: admin, body: { sellerId: hubId } })));
      const created = results.filter((r) => r.status === 201);
      assert.equal(created.length, 1, `round ${round}: ${results.map((r) => r.status).join(',')}`);
      assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
      // Settle it so the next round starts with a single fresh sale.
      await pool.query("UPDATE seller_earnings SET status = 'paid' WHERE payout_id = ?", [created[0].json.id]);
      await pool.query("UPDATE payouts SET status = 'paid', reference = 'RACE' WHERE id = ?", [created[0].json.id]);
    }
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM payouts WHERE seller_id = ?', [hubId]);
    assert.equal(Number(n), 4);
    const [[{ dup }]] = await pool.query(
      'SELECT COUNT(*) AS dup FROM (SELECT payout_id FROM seller_earnings WHERE seller_id = ? GROUP BY payout_id HAVING COUNT(*) > 1) x', [hubId]);
    assert.equal(Number(dup), 0);
    // Put the hub back to the state the later tests expect: two unpaid sales (58.20 + 97.00 net).
    await pool.query('DELETE FROM seller_earnings WHERE seller_id = ?', [hubId]);
    await pool.query('DELETE FROM payouts WHERE seller_id = ?', [hubId]);
    await earn(hubId, 'Box C', 3, 2000, 'ORD-1003');
    await earn(hubId, 'Box D', 1, 10000, 'ORD-2001');
    assert.equal((await t.api('/api/staff/payouts', { method: 'POST', token: admin, body: { sellerId: hubId } })).status, 201);
  });

  it('needs a transfer reference to mark a payout as paid', async () => {
    const r = await t.api(`/api/staff/payouts/${payoutId}/mark-paid`, { method: 'POST', token: admin, body: {} });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.details[0].field, 'reference');
    assert.equal((await t.api(`/api/staff/payouts/${payoutId}/mark-paid`, { method: 'POST', token: admin, body: { reference: 'x' } })).status, 400);
  });

  it('marks it paid once (also under concurrency), recording who and when', async () => {
    const results = await Promise.all([1, 2, 3].map(() =>
      t.api(`/api/staff/payouts/${payoutId}/mark-paid`, { method: 'POST', token: admin, body: { reference: 'ACH-7741' } })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    const ok = results.find((r) => r.status === 200).json;
    assert.equal(ok.status, 'paid');
    assert.equal(ok.reference, 'ACH-7741');
    assert.ok(ok.paidAt);
    const [[row]] = await pool.query('SELECT paid_by_staff_id FROM payouts WHERE id = ?', [payoutId]);
    assert.ok(row.paid_by_staff_id);
    const m = await mine();
    assert.equal(m.summary.paidCents, 33948);
    assert.equal(m.summary.inPayoutCents, 0);
    assert.ok(m.items.every((e) => e.status === 'paid'));
    assert.equal((await t.api('/api/seller/payouts', { token: seller })).json.items[0].reference, 'ACH-7741');
  });

  it('cannot cancel a payout that was already paid', async () => {
    const r = await t.api(`/api/staff/payouts/${payoutId}/cancel`, { method: 'POST', token: admin, body: { reason: 'oops' } });
    assert.equal(r.status, 409);
    assert.match(r.json.error.message, /already paid/);
  });

  it('cancelling frees the sales so they can be bundled again', async () => {
    const hubPayout = (await t.api(`/api/staff/payouts?sellerId=${hubId}`, { token: admin })).json.items[0];
    assert.equal((await t.api(`/api/staff/payouts/${hubPayout.id}/cancel`, { method: 'POST', token: admin, body: {} })).status, 400); // reason required
    const c = await t.api(`/api/staff/payouts/${hubPayout.id}/cancel`, { method: 'POST', token: admin, body: { reason: 'Wrong bank details' } });
    assert.equal(c.json.status, 'cancelled');
    assert.equal(c.json.note, 'Wrong bank details');
    assert.equal((await t.api(`/api/staff/payouts/${hubPayout.id}/cancel`, { method: 'POST', token: admin, body: { reason: 'again' } })).status, 409);
    assert.equal((await t.api(`/api/staff/payouts/${hubPayout.id}/mark-paid`, { method: 'POST', token: admin, body: { reference: 'ACH-1' } })).status, 409);
    const m = await mine(hub);
    assert.equal(m.summary.availableCents, 5820 + 9700);
    assert.equal(m.summary.inPayoutCents, 0);
    const again = await t.api('/api/staff/payouts', { method: 'POST', token: admin, body: { sellerId: hubId } });
    assert.equal(again.status, 201);
    assert.equal(again.json.amountCents, 15520);
  });

  it('lists and filters payouts', async () => {
    const all = (await t.api('/api/staff/payouts', { token: support })).json;
    assert.equal(all.total, 3); // paid + cancelled + new pending
    assert.equal((await t.api('/api/staff/payouts?status=paid', { token: support })).json.total, 1);
    assert.equal((await t.api('/api/staff/payouts?status=cancelled', { token: support })).json.total, 1);
    assert.equal((await t.api('/api/staff/payouts?status=pending', { token: support })).json.total, 1);
    assert.equal((await t.api(`/api/staff/payouts?sellerId=${sellerId}`, { token: support })).json.total, 1);
    assert.equal((await t.api('/api/staff/payouts?status=weird', { token: support })).status, 400);
    assert.equal((await t.api('/api/staff/payouts/not-a-uuid', { token: support })).status, 404);
  });

  it('money never goes missing: available + in payout + paid = everything not reversed', async () => {
    await earn(sellerId, 'Box E', 5, 3333, 'ORD-3001');
    const [[sum]] = await pool.query(
      "SELECT SUM(net_cents) AS net, SUM(CASE WHEN status='available' THEN net_cents END) AS a, SUM(CASE WHEN status='in_payout' THEN net_cents END) AS i, SUM(CASE WHEN status='paid' THEN net_cents END) AS p FROM seller_earnings");
    assert.equal(Number(sum.net), Number(sum.a) + Number(sum.i) + Number(sum.p));
    const o = (await t.api('/api/staff/payouts/overview', { token: admin })).json.totals;
    assert.equal(o.availableCents + o.inPayoutCents + o.paidCents, Number(sum.net));
  });

  it('writes every money action to the audit log with the amount', async () => {
    const log = (await t.api('/api/staff/audit?entityType=payout&limit=100', { token: admin })).json.items;
    const actions = log.map((a) => a.action);
    for (const a of ['payout.created', 'payout.paid', 'payout.cancelled']) assert.ok(actions.includes(a), `missing ${a}`);
    const paid = log.find((a) => a.action === 'payout.paid');
    assert.equal(paid.details.reference, 'ACH-7741');
    assert.equal(paid.details.amountCents, 33948);
    assert.equal(paid.actorName, 'TSM Admin');
  });
});
