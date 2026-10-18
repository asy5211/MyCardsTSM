// Creates backend/.env from .env.example with fresh random JWT secrets.
// Safe to re-run: it never overwrites an existing .env.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const example = join(root, '.env.example');
const target = join(root, '.env');

if (existsSync(target)) {
  console.log('.env already exists - leaving it alone. Delete it first if you want fresh secrets.');
  process.exit(0);
}
if (!existsSync(example)) {
  console.error('.env.example is missing. Re-extract the backend zip.');
  process.exit(1);
}

const secret = () => randomBytes(48).toString('base64url');
const text = readFileSync(example, 'utf8')
  .replace(/^JWT_SECRET_USER=.*$/m, `JWT_SECRET_USER=${secret()}`)
  .replace(/^JWT_SECRET_STAFF=.*$/m, `JWT_SECRET_STAFF=${secret()}`);

writeFileSync(target, text, { mode: 0o600 });
console.log('Created .env with new random secrets (file permissions: owner-only).');
console.log('Check DATABASE_URL in it matches your MySQL user and password, then run: npm run dev');
