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

  const login = async (loginName, password = DEMO_PASSWORD) => {
    const r = await api('/api/auth/login', { method: 'POST', body: { login: loginName, password } });
    if (r.status !== 200) throw new Error(`login failed for ${loginName}: ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.token;
  };

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  }

  return { api, login, stop, base };
}
