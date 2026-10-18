import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { DEMO_PASSWORD, startServer } from './helpers.js';

const address = (over = {}) => ({
  fullName: 'Casey Collector',
  line1: '12 Pack Rat Lane',
  line2: 'Apt 4',
  city: 'Austin',
  region: 'TX',
  postalCode: '78701',
  country: 'us',
  ...over,
});

describe('shipping address', () => {
  let t;
  let token;
  before(async () => {
    t = await startServer();
    token = await t.login('buyer@tsm.test', DEMO_PASSWORD);
  });
  after(() => t.stop());

  it('needs a signed-in user', async () => {
    assert.equal((await t.api('/api/me/address')).status, 401);
    assert.equal((await t.api('/api/me/address', { method: 'PUT', body: address() })).status, 401);
  });

  it('starts empty, in both /api/me/address and /api/me', async () => {
    const r = await t.api('/api/me/address', { token });
    assert.equal(r.status, 200);
    assert.equal(r.json.address, null);
    const me = await t.api('/api/me', { token });
    assert.equal(me.json.address, null);
  });

  it('saves an address, tidying the country code and blank second line', async () => {
    const r = await t.api('/api/me/address', { method: 'PUT', token, body: address({ line2: '   ' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.address, {
      fullName: 'Casey Collector',
      line1: '12 Pack Rat Lane',
      line2: null,
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      country: 'US',
    });
    const me = await t.api('/api/me', { token });
    assert.equal(me.json.address.city, 'Austin');
  });

  it('replaces the address when saved again (one address per person)', async () => {
    await t.api('/api/me/address', { method: 'PUT', token, body: address({ city: 'Dallas', postalCode: '75201-1234' }) });
    const r = await t.api('/api/me/address', { token });
    assert.equal(r.json.address.city, 'Dallas');
    assert.equal(r.json.address.postalCode, '75201-1234');
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM user_addresses WHERE user_id = (SELECT id FROM users WHERE email = 'buyer@tsm.test')");
    assert.equal(Number(n), 1);
  });

  it('points at the bad fields', async () => {
    const r = await t.api('/api/me/address', {
      method: 'PUT',
      token,
      body: address({ city: '', postalCode: 'ABCDE', fullName: '' }),
    });
    assert.equal(r.status, 400);
    const fields = r.json.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['city', 'fullName', 'postalCode']);
  });

  it('only insists on a ZIP-style code for the US', async () => {
    const r = await t.api('/api/me/address', {
      method: 'PUT',
      token,
      body: address({ country: 'CA', region: 'ON', city: 'Toronto', postalCode: 'M5V 2T6' }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.address.country, 'CA');
  });

  it('is included in the data export, and can be removed', async () => {
    const exported = await t.api('/api/me/export', { token });
    assert.equal(exported.json.shippingAddress.city, 'Toronto');
    assert.equal((await t.api('/api/me/address', { method: 'DELETE', token })).status, 204);
    assert.equal((await t.api('/api/me/address', { token })).json.address, null);
  });

  it('is erased when the account is deleted', async () => {
    const reg = await t.api('/api/auth/register', {
      method: 'POST',
      body: { username: 'moving_van', email: 'van@example.com', password: 'Sup3r$ecret', confirmPassword: 'Sup3r$ecret', acceptedTerms: true },
    });
    const userToken = reg.json.token;
    await t.api('/api/me/address', { method: 'PUT', token: userToken, body: address() });
    const del = await t.api('/api/me', { method: 'DELETE', token: userToken, body: { password: 'Sup3r$ecret' } });
    assert.equal(del.status, 204);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM user_addresses WHERE user_id = ?', [reg.json.user.id]);
    assert.equal(Number(n), 0);
  });
});
