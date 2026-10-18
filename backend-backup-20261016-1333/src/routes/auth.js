// Public account endpoints: sign up, sign in, and the forgot/reset password flow.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { HttpError, conflict, forbidden, unauthorized } from '../errors.js';
import { audit } from '../lib/audit.js';
import { userDto } from '../lib/dto.js';
import { sendPasswordReset } from '../lib/mailer.js';
import { burnPasswordTime, hashPassword, passwordSchema, verifyPassword } from '../lib/passwords.js';
import { parse } from '../lib/validate.js';
import { signUserToken } from '../middleware/auth.js';

const router = Router();

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const registerBody = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[A-Za-z0-9_.-]+$/, 'Username may only use letters, numbers, dot, dash and underscore'),
    email: z.string().trim().toLowerCase().max(255).email('Enter a valid email address'),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true, { error: 'You must accept the Terms of Service' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

router.post('/register', async (req, res) => {
  const body = parse(registerBody, req.body);
  const id = randomUUID();
  const passwordHash = await hashPassword(body.password);

  try {
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, terms_accepted_at, terms_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, body.username, body.email, passwordHash, new Date(), config.termsVersion],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const field = String(err.sqlMessage).includes('uq_users_email') ? 'email' : 'username';
      throw conflict(`That ${field} is already taken`, [{ field, message: `That ${field} is already taken` }]);
    }
    throw err;
  }

  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  await audit({ actorType: 'user', actorId: id, action: 'user.registered', entityType: 'user', entityId: id, ip: req.ip });
  res.status(201).json({ token: signUserToken(id), user: userDto(user) });
});

const loginBody = z.object({
  login: z.string().trim().min(1, 'Enter your email or username').max(255),
  password: z.string().min(1, 'Enter your password').max(200),
});

router.post('/login', async (req, res) => {
  const { login, password } = parse(loginBody, req.body);

  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1', [login, login]);

  // Same answer (and similar timing) for "no such account" and "wrong password".
  if (!user || user.status === 'deleted') {
    await burnPasswordTime(password);
    throw unauthorized('Incorrect email/username or password', 'invalid_credentials');
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    throw unauthorized('Incorrect email/username or password', 'invalid_credentials');
  }
  if (user.status === 'suspended') {
    throw forbidden('This account is suspended. Please contact support.', 'account_suspended');
  }

  await pool.query('UPDATE users SET last_login_at = ? WHERE id = ?', [new Date(), user.id]);
  res.json({ token: signUserToken(user.id), user: userDto(user) });
});

// ---- Forgot / reset password -------------------------------------------------

const forgotBody = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') });

router.post('/forgot-password', async (req, res) => {
  const { email } = parse(forgotBody, req.body);
  const [[user]] = await pool.query("SELECT id, email FROM users WHERE email = ? AND status = 'active'", [email]);

  if (user) {
    const token = randomBytes(32).toString('hex'); // only its SHA-256 is stored
    const expiresAt = new Date(Date.now() + config.resetTokenTtlMinutes * 60_000);
    await pool.query(
      'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), user.id, sha256(token), expiresAt],
    );
    await sendPasswordReset({ to: user.email, link: `${config.resetLinkBase}?token=${token}` });
    await audit({ actorType: 'user', actorId: user.id, action: 'user.password_reset_requested', entityType: 'user', entityId: user.id, ip: req.ip });
  }

  // Always the same reply so this endpoint can't be used to discover which emails have accounts.
  res.json({ message: 'If that email has an account, a reset link is on its way.' });
});

const resetBody = z
  .object({
    token: z.string().min(20).max(200),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

router.post('/reset-password', async (req, res) => {
  const body = parse(resetBody, req.body);
  const newHash = await hashPassword(body.newPassword);

  const userId = await withTransaction(async (conn) => {
    const [[row]] = await conn.query(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? FOR UPDATE',
      [sha256(body.token)],
    );
    if (!row || row.used_at || new Date(row.expires_at) <= new Date()) {
      throw new HttpError(400, 'invalid_reset_token', 'This reset link is invalid or has expired. Request a new one.');
    }
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, row.user_id]);
    await conn.query('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', [new Date(), row.id]);
    // Any other outstanding links for this account stop working too.
    await conn.query('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL', [row.user_id]);
    return row.user_id;
  });

  await audit({ actorType: 'user', actorId: userId, action: 'user.password_reset', entityType: 'user', entityId: userId, ip: req.ip });
  res.json({ message: 'Password updated. You can sign in now.' });
});

export default router;
