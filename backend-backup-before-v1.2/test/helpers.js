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
  async function apiForm(path, { method = 'POST', fields = {}, files = [], token } = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (const file of files) form.append('documents', new Blob([file.data], { type: file.type }), file.name);
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

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  }

  return { api, apiForm, download, login, stop, base };
}

/** Tiny valid-looking files (only the first bytes matter to the server). */
export const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
export const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
