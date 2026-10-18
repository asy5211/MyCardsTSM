// Creates an admin-staff login (the web admin signs in with these, not with app accounts).
//
//   npm run create-staff -- someone@example.com "Their Name" admin
//
// Roles: super_admin | admin | support.  The password is typed at a hidden prompt.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { closePool, pool } from '../src/db.js';
import { hashPassword, passwordSchema } from '../src/lib/passwords.js';

const [email, name, role = 'admin'] = process.argv.slice(2);
if (!email || !name || !['super_admin', 'admin', 'support'].includes(role)) {
  console.error('Usage: npm run create-staff -- <email> "<Full Name>" [super_admin|admin|support]');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = await askHidden('Password (8+ chars, upper, lower, number, symbol): ');
const check = passwordSchema.safeParse(password);
if (!check.success) {
  console.error(check.error.issues.map((i) => `  - ${i.message}`).join('\n'));
  process.exit(1);
}

try {
  await pool.query('INSERT INTO admin_staff (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [
    randomUUID(),
    email.toLowerCase(),
    name,
    await hashPassword(password),
    role,
  ]);
  console.log(`Created ${role} login for ${email}`);
} catch (err) {
  console.error(err.code === 'ER_DUP_ENTRY' ? `A staff account for ${email} already exists.` : err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
