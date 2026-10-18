// Shared test plumbing: boot the real app on a random port, call it with fetch.
import { buildApp } from '../src/app.js';
import { closePool } from '../src/db.js';
import { loadTestDb } from '../scripts/load-test-db.js';

export const DEMO_PASSWORD = 'Password1!';
export const ADMIN = { email: 'admin@tsm.test', password: 'AdminPass1!' };

/** Rebuild the test database, start the API, return helpers. Call once per test file. */
export async function startServer() {
  await loadTestDb();
  const server = buildApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(path, { method = 'GET', body, token } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: response.status, json, headers: response.headers };
  }

  /** Like api(), but sends multipart/form-data. files: [{ name, type, data: Buffer|string }] under the "documents" field. */
  async function apiForm(path, { method = 'POST', fields = {}, files = [], token, fileField = 'documents' } = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (const file of files) form.append(fileField, new Blob([file.data], { type: file.type }), file.name);
    const response = await fetch(base + path, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: response.status, json, headers: response.headers };
  }

  /** Raw GET (for file downloads): returns { status, bytes, headers }. */
  async function download(path, token) {
    const response = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  }

  const login = async (loginName, password = DEMO_PASSWORD) => {
    const r = await api('/api/auth/login', { method: 'POST', body: { login: loginName, password } });
    if (r.status !== 200) throw new Error(`login failed for ${loginName}: ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.token;
  };

  /** Staff sign-in: returns the staff token. */
  const staffLogin = async (email = ADMIN.email, password = ADMIN.password) => {
    const r = await api('/api/staff/login', { method: 'POST', body: { email, password } });
    if (r.status !== 200) throw new Error(`staff login failed for ${email}: ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.token;
  };

  /** Upload one product photo (multipart field "image"). */
  const uploadImage = (productId, { slot = 1, file = { name: 'p.png', type: 'image/png', data: PNG_BYTES }, token }) =>
    apiForm(`/api/staff/products/${productId}/images`, { fields: { slot: String(slot) }, files: [file], token, fileField: 'image' });

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  }

  return { api, apiForm, download, login, staffLogin, uploadImage, stop, base };
}

/** Tiny valid-looking files (only the first bytes matter to the server). */
export const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
export const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
export const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);

/** Gives a product a description and its main photo so sellers can offer it. */
export async function makeReady(t, staffToken, productId, description = 'A sealed test product for the catalog.') {
  const patched = await t.api(`/api/staff/products/${productId}`, { method: 'PATCH', token: staffToken, body: { description } });
  if (patched.status !== 200) throw new Error(`makeReady patch failed: ${patched.status} ${JSON.stringify(patched.json)}`);
  const up = await t.uploadImage(productId, { token: staffToken });
  if (up.status !== 201) throw new Error(`makeReady upload failed: ${up.status} ${JSON.stringify(up.json)}`);
  return up.json;
}

/** Any two products from the seeded catalog: [{id, name}, ...]. */
export async function someProducts(t, count = 2) {
  const r = await t.api(`/api/products?limit=${count}&sort=name`);
  return r.json.items;
}
