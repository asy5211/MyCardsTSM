// Development only: fills a running TSM server with sample activity so the seller dashboard, the admin
// pages and the app's Orders tab have something to show. It uses the public API (the same calls the app
// makes), so it also works as a quick end-to-end check.
//
//   1. Start the server:  npm run dev
//   2. In another Terminal tab:  npm run demo:sales
//
// What it creates: a buyer with a shipping address, three orders from two sellers (two of them from the
// same case, so you can watch the box numbers move on), one shipped with a tracking number, one delivered
// and reviewed with a seller reply, order chat messages, a sell-to-us ticket with a TSM price offer and a
// counter-offer, and a support request. Safe to run more than once; it adds a little more each time.
//
// Needs the demo accounts from db/sql/02_seed.sql. Development only: do not point it at a real server.

const BASE = (process.env.TSM_API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const PASSWORD = 'Password1!';
const ADMIN = { email: 'admin@tsm.test', password: 'AdminPass1!' };

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: response.status, json };
}

async function must(label, promise, okStatuses = [200, 201]) {
  const r = await promise;
  if (!okStatuses.includes(r.status)) {
    console.error(`\nStep failed: ${label}\n  HTTP ${r.status}  ${JSON.stringify(r.json)}\n`);
    process.exit(1);
  }
  console.log(`  ok  ${label}`);
  return r.json;
}

const health = await call('/health').catch(() => null);
if (!health || health.status !== 200) {
  console.error(`\nCannot reach the TSM server at ${BASE}. Start it first with "npm run dev" in another Terminal tab.\n`);
  process.exit(1);
}

console.log(`Adding sample activity to ${BASE}`);
const login = async (who) => (await must(`sign in as ${who}`, call('/api/auth/login', { method: 'POST', body: { login: who, password: PASSWORD } }))).token;
const buyer = await login('buyer@tsm.test');
const sellerA = await login('seller@tsm.test');
const sellerB = await login('hub@tsm.test');
const staff = (await must('sign in as staff', call('/api/staff/login', { method: 'POST', body: ADMIN }))).token;

await must('save the buyer’s shipping address', call('/api/me/address', {
  method: 'PUT', token: buyer,
  body: { fullName: 'Casey Collector', line1: '12 Pack Rat Lane', line2: 'Apt 4', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' },
}));

const mine = async (token) => (await call('/api/seller/listings?limit=100', { token })).json.items;
const aOffers = (await mine(sellerA)).filter((l) => l.status === 'live' && l.quantityAvailable >= 3);
const bOffers = (await mine(sellerB)).filter((l) => l.status === 'live' && l.quantityAvailable >= 3);
const caseOffer = aOffers.find((l) => l.packaging === 'case');
const looseA = aOffers.find((l) => l.packaging === 'loose');
const anyB = bOffers[0];
if (!caseOffer || !anyB) {
  console.error('\nCould not find live offers to buy. Re-run db/sql/02_seed.sql (and 02b) first.\n');
  process.exit(1);
}

const buy = async (lines, label) => (await must(label, call('/api/orders', { method: 'POST', token: buyer, body: { items: lines } }))).orders;
const first = await buy([{ listingId: caseOffer.id, quantity: 1 }], 'buy 1 box from a case (first purchase)');
const second = await buy([{ listingId: caseOffer.id, quantity: 2 }], 'buy 2 more from the same case (the box numbers move on)');
const third = await buy([{ listingId: (looseA ?? anyB).id, quantity: 1 }, ...(looseA && anyB && looseA.id !== anyB.id ? [{ listingId: anyB.id, quantity: 1 }] : [])], 'buy loose product');
console.log(`      boxes: ${[...first, ...second].flatMap((o) => o.items.map((i) => i.boxLabel)).filter(Boolean).join(' | ')}`);

const shipped = first[0];
await must('seller ships the first order with a tracking number', call(`/api/seller/orders/${shipped.id}/ship`, {
  method: 'POST', token: sellerA, body: { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' },
}));
await must('buyer marks it received', call(`/api/orders/${shipped.id}/delivered`, { method: 'POST', token: buyer, body: {} }));
const review = await must('buyer leaves 5 stars', call(`/api/orders/${shipped.id}/items/${shipped.items[0].id}/review`, {
  method: 'POST', token: buyer, body: { rating: 5, comment: 'Sealed perfectly and shipped fast. Exactly as described.' },
}));
await must('seller answers the review', call(`/api/seller/reviews/${review.id ?? review.review?.id}/respond`, {
  method: 'POST', token: sellerA, body: { response: 'Thank you! Enjoy the box.' },
}));
await must('buyer messages the seller', call(`/api/orders/${second[0].id}/messages`, { method: 'POST', token: buyer, body: { body: 'Hi! Could you ship this one before the weekend?' } }));
await must('seller replies', call(`/api/seller/orders/${second[0].id}/messages`, { method: 'POST', token: sellerA, body: { body: 'Yes, it goes out tomorrow morning.' } }));

const ticket = await must('seller sends TSM a sell-to-us ticket', call('/api/sell-tickets', {
  method: 'POST', token: sellerA,
  body: { items: [{ productName: 'Crimson Storm Booster Box', quantity: 12, source: 'Authorized distributor', minPricePerItemCents: 9500 }, { productName: 'Elite Series Case', quantity: 2, source: 'Authorized distributor' }] },
}));
await must('TSM starts reviewing', call(`/api/staff/tickets/${ticket.id}/start-review`, { method: 'POST', token: staff, body: {} }));
await must('TSM sends a price offer', call(`/api/staff/tickets/${ticket.id}/offer`, { method: 'POST', token: staff, body: { amountCents: 148000, message: 'We can pay this for the whole lot, paid outside the app once it arrives.' } }));
await must('seller counters', call(`/api/sell-tickets/${ticket.id}/counter`, { method: 'POST', token: sellerA, body: { amountCents: 156000, message: 'Could we meet at this?' } }));

await must('buyer contacts support', call('/api/support', {
  method: 'POST', token: buyer, body: { topic: 'order', subject: 'Where is my second order?', message: 'It has been two days and there is no tracking number yet. Can you check on it?' },
}));

console.log(`\nDone. ${first.length + second.length + third.length} orders, 1 review, 1 sell-to-us ticket and 1 support request were added.`);
console.log('Look at them in the Seller portal (seller@tsm.test), the Staff console (admin@tsm.test) and the app\'s Orders tab (buyer@tsm.test).\n');
process.exit(0);
