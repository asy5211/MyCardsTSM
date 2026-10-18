// Small building blocks shared by the v4 test files (orders, seller business, tickets, admin).
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { makeReady } from './helpers.js';

export const shipTo = (over = {}) => ({
  fullName: 'Casey Collector',
  line1: '12 Pack Rat Lane',
  line2: 'Apt 4',
  city: 'Austin',
  region: 'TX',
  postalCode: '78701',
  country: 'US',
  ...over,
});

export async function setAddress(t, token, over = {}) {
  const r = await t.api('/api/me/address', { method: 'PUT', token, body: shipTo(over) });
  assert.equal(r.status, 200, `setAddress: ${JSON.stringify(r.json)}`);
}

let counter = 0;
/** A brand-new customer account. With {address: true} it also has a shipping address, so it can check out. */
export async function newUser(t, label, { address = false } = {}) {
  counter += 1;
  const username = `${label}_${counter}`;
  const reg = await t.api('/api/auth/register', {
    method: 'POST',
    body: { username, email: `${username}@example.com`, password: 'Sup3r$ecret', confirmPassword: 'Sup3r$ecret', acceptedTerms: true },
  });
  assert.equal(reg.status, 201, `register: ${JSON.stringify(reg.json)}`);
  if (address) await setAddress(t, reg.json.token);
  return { token: reg.json.token, id: reg.json.user.id, username, email: `${username}@example.com` };
}

/** The ids of `count` catalog products that staff have finished (description + photo), so sellers can offer them. */
export async function readyProducts(t, adminToken, count) {
  const list = await t.api(`/api/staff/products?limit=${count}`, { token: adminToken });
  assert.equal(list.status, 200);
  const ids = list.json.items.slice(0, count).map((p) => p.id);
  for (const id of ids) await makeReady(t, adminToken, id);
  return ids;
}

/** Creates an offer as a seller. Defaults to a case offer "Box 4 of 12" at $100.00 with 6 in stock. */
export async function offer(t, token, productId, over = {}) {
  const body = {
    productId, priceCents: 10000, quantityAvailable: 6, sourceType: 'distributor', distributor: 'Card Depot',
    packaging: 'case', boxNumber: 4, boxesInCase: 12, ...over,
  };
  const r = await t.api('/api/seller/listings', { method: 'POST', token, body });
  assert.equal(r.status, 201, `offer: ${JSON.stringify(r.json)}`);
  return r.json;
}

/** Loose (not from a case) offer at $50.00 with 20 in stock. */
export const looseOffer = (t, token, productId, over = {}) =>
  offer(t, token, productId, { packaging: 'loose', boxNumber: undefined, boxesInCase: undefined, priceCents: 5000, quantityAvailable: 20, ...over });

export async function auditCount(action, entityId = null) {
  const [[row]] = entityId
    ? await pool.query('SELECT COUNT(*) AS n FROM audit_logs WHERE action = ? AND entity_id = ?', [action, entityId])
    : await pool.query('SELECT COUNT(*) AS n FROM audit_logs WHERE action = ?', [action]);
  return Number(row.n);
}
