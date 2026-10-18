import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';
import { DEMO_PASSWORD, JPEG_BYTES, PDF_BYTES, PNG_BYTES, WEBP_BYTES, makeReady, someProducts, startServer } from './helpers.js';

describe('admin: catalog (brands, products, photos)', () => {
  let t;
  let admin;
  let support;
  let buyer;
  let brandId;
  let typeId;

  before(async () => {
    t = await startServer();
    admin = await t.staffLogin();
    await pool.query(
      "INSERT INTO admin_staff (id, email, name, password_hash, role) VALUES (UUID(), 'support@tsm.test', 'Sam Support', ?, 'support')",
      [await hashPassword('SupportPass1!')],
    );
    support = await t.staffLogin('support@tsm.test', 'SupportPass1!');
    buyer = await t.login('buyer@tsm.test', DEMO_PASSWORD);
    const brands = await t.api('/api/staff/brands', { token: admin });
    brandId = brands.json[0].id;
    typeId = (await t.api('/api/staff/product-types', { token: admin })).json[0].id;
  });
  after(() => t.stop());

  const newProduct = (over = {}) => ({
    brandId, productTypeId: typeId, name: 'Test Sealed Box', description: 'A sealed box made for the tests.', ...over,
  });

  it('keeps everything staff-only (customers and anonymous callers are refused)', async () => {
    for (const path of ['/api/staff/brands', '/api/staff/products', '/api/staff/product-types']) {
      assert.equal((await t.api(path)).status, 401);
      assert.equal((await t.api(path, { token: buyer })).status, 401); // a customer token is not a staff token
    }
  });

  it('lets support staff look but not change', async () => {
    assert.equal((await t.api('/api/staff/products', { token: support })).status, 200);
    const r = await t.api('/api/staff/products', { method: 'POST', token: support, body: newProduct() });
    assert.equal(r.status, 403);
    assert.equal((await t.api('/api/staff/brands', { method: 'POST', token: support, body: { name: 'Nope' } })).status, 403);
  });

  it('creates and edits brands, refusing duplicates', async () => {
    const made = await t.api('/api/staff/brands', { method: 'POST', token: admin, body: { name: 'Zeta Cards', sortOrder: 99 } });
    assert.equal(made.status, 201);
    assert.equal(made.json.productCount, 0);
    assert.equal((await t.api('/api/staff/brands', { method: 'POST', token: admin, body: { name: 'zeta cards' } })).status, 409);
    const patched = await t.api(`/api/staff/brands/${made.json.id}`, { method: 'PATCH', token: admin, body: { isActive: false } });
    assert.equal(patched.json.isActive, false);
    // a deactivated brand leaves the public Home grid
    const pub = await t.api('/api/brands');
    assert.ok(!pub.json.some((b) => b.name === 'Zeta Cards'));
  });

  it('checks a new product', async () => {
    const r = await t.api('/api/staff/products', { method: 'POST', token: admin, body: { brandId: 'nope', name: 'x', description: 'short' } });
    assert.equal(r.status, 400);
    const fields = r.json.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['brandId', 'description', 'name', 'productTypeId']);
  });

  it('a new product is NOT ready for sellers until it has a photo', async () => {
    const made = await t.api('/api/staff/products', { method: 'POST', token: admin, body: newProduct() });
    assert.equal(made.status, 201);
    assert.equal(made.json.isReady, false);
    assert.equal(made.json.hasPhoto, false);
    assert.equal(made.json.hasDescription, true);
    assert.equal((await t.api('/api/staff/products', { method: 'POST', token: admin, body: newProduct() })).status, 409); // same name, same brand
  });

  it('stores an uploaded photo, serves it publicly, and the product becomes ready', async () => {
    const made = await t.api('/api/staff/products', { method: 'POST', token: admin, body: newProduct({ name: 'Photo Test Box' }) });
    const id = made.json.id;
    const up = await t.uploadImage(id, { token: admin });
    assert.equal(up.status, 201);
    assert.equal(up.json.isReady, true);
    assert.equal(up.json.images.length, 1);
    const url = up.json.images[0].url;
    assert.match(url, new RegExp(`^/media/products/${id}/[0-9a-f-]+\\.png$`));
    assert.equal(up.json.thumbnailUrl, url);

    // The mobile app and the admin site (another origin) load it without signing in.
    const file = await t.download(url);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.equal(file.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.deepEqual(file.bytes, PNG_BYTES);

    // ...and the shop sends the same address to the app.
    const pub = await t.api(`/api/products/${id}`);
    assert.equal(pub.json.thumbnailUrl, url);
    assert.equal(pub.json.images[0].url, url);
    const list = await t.api('/api/products?q=Photo%20Test');
    assert.equal(list.json.items[0].thumbnailUrl, url);
  });

  it('replacing a photo swaps the file and deletes the old one', async () => {
    const made = await t.api('/api/staff/products', { method: 'POST', token: admin, body: newProduct({ name: 'Swap Test Box' }) });
    const id = made.json.id;
    const first = await t.uploadImage(id, { token: admin });
    const oldKey = first.json.images[0].imageKey;
    assert.ok(existsSync(`${config.uploadDir}/${oldKey}`));
    const second = await t.uploadImage(id, { token: admin, file: { name: 'b.jpg', type: 'image/jpeg', data: JPEG_BYTES } });
    assert.equal(second.status, 201);
    assert.equal(second.json.images.length, 1);
    assert.match(second.json.images[0].url, /\.jpg$/);
    assert.ok(!existsSync(`${config.uploadDir}/${oldKey}`), 'old file should be removed');
    assert.equal((await t.download(first.json.images[0].url)).status, 404);
  });

  it('accepts WebP and up to three photo slots, and can remove a photo', async () => {
    const made = await t.api('/api/staff/products', { method: 'POST', token: admin, body: newProduct({ name: 'Slots Test Box' }) });
    const id = made.json.id;
    for (const slot of [1, 2, 3]) {
      const r = await t.uploadImage(id, { token: admin, slot, file: { name: 's.webp', type: 'image/webp', data: WEBP_BYTES } });
      assert.equal(r.status, 201);
    }
    const four = await t.uploadImage(id, { token: admin, slot: 4 });
    assert.equal(four.status, 400);
    const removed = await t.api(`/api/staff/products/${id}/images/1`, { method: 'DELETE', token: admin });
    assert.equal(removed.status, 200);
    assert.equal(removed.json.hasPhoto, false); // no main photo any more
    assert.equal(removed.json.isReady, false);
    assert.equal(removed.json.thumbnailUrl, null);
    assert.equal(removed.json.images.length, 2);
  });

  it('refuses things that are not pictures, no file, and files that are too big', async () => {
    const made = await t.api('/api/staff/products', { method: 'POST', token: admin, body: newProduct({ name: 'Bad Upload Box' }) });
    const id = made.json.id;
    const pdf = await t.uploadImage(id, { token: admin, file: { name: 'x.png', type: 'image/png', data: PDF_BYTES } }); // lying about the type
    assert.equal(pdf.status, 400);
    assert.match(pdf.json.error.details[0].message, /JPEG, PNG or WebP/);
    const none = await t.apiForm(`/api/staff/products/${id}/images`, { fields: { slot: '1' }, files: [], token: admin, fileField: 'image' });
    assert.equal(none.status, 400);
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(config.maxProductImageBytes)]);
    const tooBig = await t.uploadImage(id, { token: admin, file: { name: 'big.png', type: 'image/png', data: big } });
    assert.equal(tooBig.status, 413);
    const denied = await t.uploadImage(id, { token: support });
    assert.equal(denied.status, 403);
  });

  it('never serves the private seller documents or anything outside the products folder', async () => {
    assert.equal((await t.download('/media/seller-applications/x/y.pdf')).status, 404);
    assert.equal((await t.download('/media/products/../seller-applications/x.pdf')).status, 404);
    assert.equal((await t.download('/media/products/%2e%2e/%2e%2e/.env')).status, 404);
  });

  it('hides a deactivated product from the shop and from sellers, and brings it back', async () => {
    const [p] = await someProducts(t, 1);
    await makeReady(t, admin, p.id);
    const off = await t.api(`/api/staff/products/${p.id}`, { method: 'PATCH', token: admin, body: { isActive: false } });
    assert.equal(off.json.isActive, false);
    assert.equal(off.json.isReady, false);
    assert.equal((await t.api(`/api/products/${p.id}`)).status, 404);
    const on = await t.api(`/api/staff/products/${p.id}`, { method: 'PATCH', token: admin, body: { isActive: true } });
    assert.equal(on.json.isReady, true);
    assert.equal((await t.api(`/api/products/${p.id}`)).status, 200);
  });

  it('filters the product list, including products that still need a photo or description', async () => {
    const all = await t.api('/api/staff/products?limit=200', { token: admin });
    assert.ok(all.json.total >= 29);
    const needs = await t.api('/api/staff/products?status=needs_content&limit=200', { token: admin });
    assert.ok(needs.json.items.length > 0);
    assert.ok(needs.json.items.every((p) => !p.isReady || p.isActive === false));
    assert.ok(needs.json.items.every((p) => !p.hasPhoto || !p.hasDescription));
    const found = await t.api('/api/staff/products?q=Photo%20Test', { token: admin });
    assert.equal(found.json.items.length, 1);
  });

  it('records every change in the audit log with who did it', async () => {
    const log = await t.api('/api/staff/audit?limit=200', { token: admin });
    const actions = new Set(log.json.items.map((a) => a.action));
    for (const a of ['brand.created', 'brand.updated', 'product.created', 'product.image_set', 'product.image_removed', 'product.deactivated', 'product.activated']) {
      assert.ok(actions.has(a), `missing audit action ${a}`);
    }
    const created = log.json.items.find((a) => a.action === 'product.created');
    assert.equal(created.actorType, 'staff');
    assert.equal(created.actorName, 'TSM Admin');
  });
});
