// A stand-in for the admin website's "Seller applications" screen, until that exists.
// The server must be running (npm run dev). Uses the same staff API the website will use.
//
//   npm run review -- list
//   npm run review -- approve <id> ["note to the applicant"]
//   npm run review -- decline <id> "reason the applicant will see"
//
// <id> can be just the first 8 characters shown by "list".
// Signs in as the demo admin by default; for anyone else set STAFF_EMAIL and STAFF_PASSWORD.
import 'dotenv/config';

const base = `http://127.0.0.1:${process.env.PORT ?? 4000}`;
const email = process.env.STAFF_EMAIL ?? 'admin@tsm.test';
const password = process.env.STAFF_PASSWORD ?? 'AdminPass1!';
const [command, idArg, ...rest] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function call(path, { method = 'GET', body, token } = {}) {
  let response;
  try {
    response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    fail(`Can't reach the server at ${base}. Is "npm run dev" running in another Terminal window?`);
  }
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const details = (json?.error?.details ?? []).map((d) => d.message).join('; ');
    fail(`${json?.error?.message ?? response.statusText}${details ? ` (${details})` : ''}`);
  }
  return json;
}

if (!['list', 'approve', 'decline'].includes(command ?? '')) {
  fail('Usage:\n  npm run review -- list\n  npm run review -- approve <id> ["note"]\n  npm run review -- decline <id> "reason"');
}

const { token } = await call('/api/staff/login', { method: 'POST', body: { email, password } });
const waiting = await call('/api/staff/seller-applications?limit=100', { token });

if (command === 'list') {
  if (waiting.items.length === 0) console.log('No applications are waiting for review.');
  for (const a of waiting.items) {
    console.log(`${a.id.slice(0, 8)}  ${a.status.padEnd(12)}  ${a.businessName}  (${a.applicant.email}, ${a.documentCount} document${a.documentCount === 1 ? '' : 's'})`);
  }
  process.exit(0);
}

if (!idArg) fail('Say which application: the first 8 characters of its id from "list".');
const matches = waiting.items.filter((a) => a.id.startsWith(idArg));
if (matches.length !== 1) fail(matches.length === 0 ? `No waiting application starts with "${idArg}".` : `More than one starts with "${idArg}"; type more characters.`);
const target = matches[0];

const note = rest.join(' ').trim();
if (command === 'decline' && !note) fail('Declining needs a reason the applicant will see, e.g.\n  npm run review -- decline 6e837edc "The permit has expired."');

const result = await call(`/api/staff/seller-applications/${target.id}/${command}`, {
  method: 'POST',
  token,
  body: command === 'approve' ? (note ? { note } : {}) : { note },
});
console.log(`${command === 'approve' ? 'Approved' : 'Declined'}: ${result.application.businessName} (${result.application.applicant.email}) is now "${result.application.status}".`);
