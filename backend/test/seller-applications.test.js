import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { loadTestDb } from '../scripts/load-test-db.js';
import { pathForKey } from '../src/lib/uploads.js';
import { ADMIN, DEMO_PASSWORD, PDF_BYTES, PNG_BYTES, startServer } from './helpers.js';

const fields = (over = {}) => ({
  businessName: 'Gulf Coast Cards',
  businessAddress: '88 Harbor St, Galveston, TX 77550',
  contactEmail: 'Owner@GulfCoastCards.example',
  phoneNumber: '(555) 010-1999',
  sourceType: 'distributor',
  distributorList: 'Southeast Card Distribution, Pacific Hobby Wholesale',
  ...over,
});
const pdf = (name = 'city_permit.pdf') => ({ name, type: 'application/pdf', data: PDF_BYTES });

let counter = 0;
async function newUser(t, label) {
  counter += 1;
  const username = `${label}_${counter}`;
  const reg = await t.api('/api/auth/register', {
    method: 'POST',
    body: { username, email: `${username}@example.com`, password: 'Sup3r$ecret', confirmPassword: 'Sup3r$ecret', acceptedTerms: true },
  });
  assert.equal(reg.status, 201);
  return { token: reg.json.token, id: reg.json.user.id, username };
}

let t; // one server (and one database pool) for the whole file
before(async () => {
  t = await startServer();
});
after(() => t.stop());

describe('seller applications (applicant side)', () => {
  it('needs a signed-in user', async () => {
    assert.equal((await t.api('/api/me/seller-application')).status, 401);
    assert.equal((await t.apiForm('/api/me/seller-application', { fields: fields(), files: [pdf()] })).status, 401);
  });

  it('shows nothing before anyone has applied', async () => {
    const u = await newUser(t, 'fresh');
    const r = await t.api('/api/me/seller-application', { token: u.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.application, null);
  });

  it('the seeded applicant sees their application waiting, with its documents, and cannot apply twice', async () => {
    const token = await t.login('applicant@tsm.test', DEMO_PASSWORD);
    const r = await t.api('/api/me/seller-application', { token });
    assert.equal(r.json.application.status, 'submitted');
    assert.equal(r.json.application.businessName, 'Lone Star Cards LLC');
    assert.equal(r.json.application.documents.length, 2);
    const again = await t.apiForm('/api/me/seller-application', { token, fields: fields(), files: [pdf()] });
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, 'application_pending');
  });

  it('accepts an application with documents and then reports it as waiting', async () => {
    const u = await newUser(t, 'applicant');
    const r = await t.apiForm('/api/me/seller-application', {
      token: u.token,
      fields: fields({ documentTypes: 'city_permit,tax_permit' }),
      files: [pdf('permit—2026.pdf'), { name: 'tax.png', type: 'image/png', data: PNG_BYTES }],
    });
    assert.equal(r.status, 201);
    const app = r.json.application;
    assert.equal(app.status, 'submitted');
    assert.equal(app.contactEmail, 'owner@gulfcoastcards.example');
    assert.deepEqual(app.documents.map((d) => [d.type, d.mimeType, d.filename]), [
      ['city_permit', 'application/pdf', 'permit—2026.pdf'],
      ['tax_permit', 'image/png', 'tax.png'],
    ]);

    const me = await t.api('/api/me', { token: u.token });
    assert.equal(me.json.isApprovedSeller, false);
    assert.equal(me.json.sellerApplication.status, 'submitted');

    const second = await t.apiForm('/api/me/seller-application', { token: u.token, fields: fields({ businessName: 'Another' }), files: [pdf()] });
    assert.equal(second.status, 409);
    assert.equal(second.json.error.code, 'application_pending');
  });

  it('asks for at least one document, and for sensible fields', async () => {
    const u = await newUser(t, 'sloppy');
    const none = await t.apiForm('/api/me/seller-application', { token: u.token, fields: fields(), files: [] });
    assert.equal(none.status, 400);
    assert.equal(none.json.error.details[0].field, 'documents');

    const bad = await t.apiForm('/api/me/seller-application', {
      token: u.token,
      fields: fields({ businessName: '', contactEmail: 'nope', sourceType: 'dropship' }),
      files: [pdf()],
    });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.json.error.details.map((d) => d.field).sort(), ['businessName', 'contactEmail', 'sourceType']);
  });

  it('judges files by their contents, not their names', async () => {
    const u = await newUser(t, 'sneaky');
    const r = await t.apiForm('/api/me/seller-application', {
      token: u.token,
      fields: fields(),
      files: [{ name: 'permit.pdf', type: 'application/pdf', data: '<html><script>alert(1)</script></html>' }],
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error.details[0].message, /isn't a PDF, JPEG, PNG or HEIC/);
    const after = await t.api('/api/me/seller-application', { token: u.token });
    assert.equal(after.json.application, null);
  });

  it('refuses oversized files and too many files', async () => {
    const u = await newUser(t, 'bulky');
    const big = Buffer.concat([PDF_BYTES, Buffer.alloc(config.maxUploadBytes + 1)]);
    const large = await t.apiForm('/api/me/seller-application', {
      token: u.token,
      fields: fields(),
      files: [{ name: 'huge.pdf', type: 'application/pdf', data: big }],
    });
    assert.equal(large.status, 413);
    assert.equal(large.json.error.code, 'file_too_large');

    const many = await t.apiForm('/api/me/seller-application', {
      token: u.token,
      fields: fields(),
      files: Array.from({ length: config.maxApplicationDocuments + 1 }, (_, i) => pdf(`doc${i}.pdf`)),
    });
    assert.equal(many.status, 400);
    assert.equal(many.json.error.code, 'too_many_files');
  });

  it('a "test" application approves itself on a development server (no documents needed)', async () => {
    const u = await newUser(t, 'tester');
    const r = await t.api('/api/me/seller-application', {
      method: 'POST',
      token: u.token,
      body: fields({ businessName: 'Quick Test Shop', sourceType: 'test', distributorList: '' }),
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.application.status, 'approved');
    assert.equal(r.json.application.isTest, true);
    const me = await t.api('/api/me', { token: u.token });
    assert.equal(me.json.isApprovedSeller, true);
    assert.equal(me.json.sellerProfile.displayName, 'Quick Test Shop');

    const again = await t.api('/api/me/seller-application', { method: 'POST', token: u.token, body: fields({ sourceType: 'test' }) });
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, 'already_seller');
  });

  it('turns "test" applications away when the server setting is off', async () => {
    const u = await newUser(t, 'prodlike');
    config.allowTestSellerAutoApprove = false;
    try {
      const r = await t.api('/api/me/seller-application', { method: 'POST', token: u.token, body: fields({ sourceType: 'test' }) });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.details[0].field, 'sourceType');
    } finally {
      config.allowTestSellerAutoApprove = true;
    }
  });

  it('removes the stored files when the account is deleted', async () => {
    const u = await newUser(t, 'leaver');
    const r = await t.apiForm('/api/me/seller-application', { token: u.token, fields: fields(), files: [pdf()] });
    assert.equal(r.status, 201);
    const [[doc]] = await pool.query(
      'SELECT d.storage_key FROM seller_application_documents d JOIN seller_applications a ON a.id = d.application_id WHERE a.user_id = ?',
      [u.id],
    );
    assert.ok(existsSync(pathForKey(doc.storage_key)), 'file should be on disk');
    const del = await t.api('/api/me', { method: 'DELETE', token: u.token, body: { password: 'Sup3r$ecret' } });
    assert.equal(del.status, 204);
    assert.equal(existsSync(pathForKey(doc.storage_key)), false, 'file should be gone');
  });

  it('closes out a waiting application when the applicant deletes their account', async () => {
    const u = await newUser(t, 'ghost');
    const r = await t.apiForm('/api/me/seller-application', { token: u.token, fields: fields(), files: [pdf()] });
    assert.equal(r.status, 201);
    const del = await t.api('/api/me', { method: 'DELETE', token: u.token, body: { password: 'Sup3r$ecret' } });
    assert.equal(del.status, 204);
    const [[row]] = await pool.query('SELECT status, decision_note, business_address FROM seller_applications WHERE id = ?', [r.json.application.id]);
    assert.equal(row.status, 'declined');
    assert.equal(row.decision_note, 'The applicant deleted their account.');
    assert.equal(row.business_address, '[removed]');
  });
});

describe('seller applications (staff review)', () => {
  let staffToken;
  let supportToken;
  before(async () => {
    await loadTestDb(); // start the review queue from the demo data, without the applicants made above
    staffToken = (await t.api('/api/staff/login', { method: 'POST', body: ADMIN })).json.token;
    await pool.query("INSERT INTO admin_staff (id, email, name, password_hash, role) VALUES (?, 'help@tsm.test', 'Help Desk', ?, 'support')", [
      randomUUID(),
      await hashPassword('HelpPass1!'),
    ]);
    supportToken = (await t.api('/api/staff/login', { method: 'POST', body: { email: 'help@tsm.test', password: 'HelpPass1!' } })).json.token;
  });

  async function apply(label, over = {}) {
    const u = await newUser(t, label);
    const r = await t.apiForm('/api/me/seller-application', { token: u.token, fields: fields(over), files: [pdf(), { name: 'p.png', type: 'image/png', data: PNG_BYTES }] });
    assert.equal(r.status, 201);
    return { ...u, applicationId: r.json.application.id, documents: r.json.application.documents };
  }

  it('keeps ordinary users and anonymous callers out', async () => {
    const u = await newUser(t, 'nosy');
    assert.equal((await t.api('/api/staff/seller-applications')).status, 401);
    assert.equal((await t.api('/api/staff/seller-applications', { token: u.token })).status, 401);
  });

  it('lists the waiting applications, oldest first, with who applied', async () => {
    const mine = await apply('queue');
    const r = await t.api('/api/staff/seller-applications', { token: staffToken });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 2); // the seeded Lone Star application + the one just made
    assert.deepEqual(r.json.items.map((i) => i.businessName), ['Lone Star Cards LLC', 'Gulf Coast Cards']);
    const item = r.json.items[1];
    assert.equal(item.applicant.username, mine.username);
    assert.equal(item.documentCount, 2);
    assert.equal(item.status, 'submitted');
  });

  it('filters by status and rejects unknown statuses', async () => {
    const seededTest = await t.api('/api/staff/seller-applications?status=approved', { token: staffToken });
    assert.equal(seededTest.status, 200);
    assert.deepEqual(seededTest.json.items.map((i) => i.businessName), ['Demo Seller Trading Co. (test)']);
    assert.equal((await t.api('/api/staff/seller-applications?status=maybe', { token: staffToken })).status, 400);
  });

  it('shows one application with the applicant and lets staff open a document', async () => {
    const mine = await apply('detail');
    const r = await t.api(`/api/staff/seller-applications/${mine.applicationId}`, { token: staffToken });
    assert.equal(r.status, 200);
    assert.equal(r.json.application.applicant.username, mine.username);
    assert.equal(r.json.application.documents.length, 2);

    const file = await t.download(`/api/staff/seller-applications/${mine.applicationId}/documents/${mine.documents[0].id}`, staffToken);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(file.bytes, PDF_BYTES);

    // Applicants and strangers cannot fetch it, and a document id from another application is not found.
    assert.equal((await t.download(`/api/staff/seller-applications/${mine.applicationId}/documents/${mine.documents[0].id}`, mine.token)).status, 401);
    const other = await apply('other');
    assert.equal((await t.download(`/api/staff/seller-applications/${other.applicationId}/documents/${mine.documents[0].id}`, staffToken)).status, 404);
    assert.equal((await t.api('/api/staff/seller-applications/not-a-uuid', { token: staffToken })).status, 404);

    const [logs] = await pool.query("SELECT actor_id FROM audit_logs WHERE action = 'seller_application.document_viewed' AND entity_id = ?", [mine.applicationId]);
    assert.equal(logs.length, 1);
  });

  it('lets support staff look but not decide', async () => {
    const mine = await apply('lookonly');
    assert.equal((await t.api(`/api/staff/seller-applications/${mine.applicationId}`, { token: supportToken })).status, 200);
    const approve = await t.api(`/api/staff/seller-applications/${mine.applicationId}/approve`, { method: 'POST', token: supportToken, body: {} });
    assert.equal(approve.status, 403);
    const decline = await t.api(`/api/staff/seller-applications/${mine.applicationId}/decline`, { method: 'POST', token: supportToken, body: { note: 'no' } });
    assert.equal(decline.status, 403);
  });

  it('marks an application as under review (and stays quiet if repeated)', async () => {
    const mine = await apply('reviewing');
    const first = await t.api(`/api/staff/seller-applications/${mine.applicationId}/start-review`, { method: 'POST', token: staffToken });
    assert.equal(first.json.application.status, 'under_review');
    const again = await t.api(`/api/staff/seller-applications/${mine.applicationId}/start-review`, { method: 'POST', token: staffToken });
    assert.equal(again.status, 200);
    const me = await t.api('/api/me', { token: mine.token });
    assert.equal(me.json.sellerApplication.status, 'under_review');
    // Still blocks a second application while under review.
    const second = await t.apiForm('/api/me/seller-application', { token: mine.token, fields: fields(), files: [pdf()] });
    assert.equal(second.status, 409);
  });

  it('approving makes the person a seller, once', async () => {
    const mine = await apply('winner', { businessName: 'Winner Wholesale' });
    const r = await t.api(`/api/staff/seller-applications/${mine.applicationId}/approve`, {
      method: 'POST',
      token: staffToken,
      body: { note: 'Documents check out.' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.application.status, 'approved');
    assert.equal(r.json.application.reviewedBy, 'TSM Admin');
    assert.equal(r.json.application.sellerProfile.displayName, 'Winner Wholesale');

    const me = await t.api('/api/me', { token: mine.token });
    assert.equal(me.json.isApprovedSeller, true);
    assert.equal(me.json.sellerProfile.displayName, 'Winner Wholesale');
    assert.equal(me.json.sellerApplication.status, 'approved');
    assert.equal(me.json.sellerApplication.decisionNote, 'Documents check out.');

    const twice = await t.api(`/api/staff/seller-applications/${mine.applicationId}/approve`, { method: 'POST', token: staffToken, body: {} });
    assert.equal(twice.status, 409);
    assert.equal(twice.json.error.code, 'already_decided');
    const apply2 = await t.apiForm('/api/me/seller-application', { token: mine.token, fields: fields(), files: [pdf()] });
    assert.equal(apply2.json.error.code, 'already_seller');

    const [logs] = await pool.query("SELECT actor_type FROM audit_logs WHERE action = 'seller_application.approved' AND entity_id = ?", [mine.applicationId]);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].actor_type, 'staff');
  });

  it('keeps store names unique: asks for another when taken, numbers the default when needed', async () => {
    const a = await apply('clashA', { businessName: 'Demo Seller' });
    const taken = await t.api(`/api/staff/seller-applications/${a.applicationId}/approve`, {
      method: 'POST',
      token: staffToken,
      body: { displayName: 'Demo Seller' },
    });
    assert.equal(taken.status, 409);
    assert.equal(taken.json.error.code, 'display_name_taken');
    assert.equal(taken.json.error.details[0].field, 'displayName');

    const numbered = await t.api(`/api/staff/seller-applications/${a.applicationId}/approve`, { method: 'POST', token: staffToken, body: {} });
    assert.equal(numbered.status, 200);
    assert.equal(numbered.json.application.sellerProfile.displayName, 'Demo Seller 2');
  });

  it('declining needs a note, tells the applicant, and lets them apply again', async () => {
    const mine = await apply('declined');
    const noNote = await t.api(`/api/staff/seller-applications/${mine.applicationId}/decline`, { method: 'POST', token: staffToken, body: {} });
    assert.equal(noNote.status, 400);

    const r = await t.api(`/api/staff/seller-applications/${mine.applicationId}/decline`, {
      method: 'POST',
      token: staffToken,
      body: { note: 'The permit has expired.' },
    });
    assert.equal(r.json.application.status, 'declined');

    const me = await t.api('/api/me', { token: mine.token });
    assert.equal(me.json.isApprovedSeller, false);
    assert.equal(me.json.sellerApplication.status, 'declined');
    assert.equal(me.json.sellerApplication.decisionNote, 'The permit has expired.');

    const retry = await t.apiForm('/api/me/seller-application', { token: mine.token, fields: fields({ businessName: 'Second Attempt' }), files: [pdf()] });
    assert.equal(retry.status, 201);
    const latest = await t.api('/api/me', { token: mine.token });
    assert.equal(latest.json.sellerApplication.status, 'submitted');

    const decideAgain = await t.api(`/api/staff/seller-applications/${mine.applicationId}/approve`, { method: 'POST', token: staffToken, body: {} });
    assert.equal(decideAgain.status, 409);
  });

  it('two staff members approving at the same moment create one seller, not two', async () => {
    const mine = await apply('race');
    const go = () => t.api(`/api/staff/seller-applications/${mine.applicationId}/approve`, { method: 'POST', token: staffToken, body: {} });
    const results = await Promise.all([go(), go()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM seller_profiles WHERE user_id = ?', [mine.id]);
    assert.equal(Number(n), 1);
  });
});
