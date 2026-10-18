// Two separate login populations: app users and admin staff. Each has its own
// signing secret and token "typ", so a customer token can never pass as staff.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import { forbidden, unauthorized } from '../errors.js';

export function signUserToken(userId) {
  return jwt.sign({ typ: 'user' }, config.jwt.userSecret, {
    subject: userId,
    expiresIn: config.jwt.userTtl,
    algorithm: 'HS256',
  });
}

export function signStaffToken(staffId, role) {
  return jwt.sign({ typ: 'staff', role }, config.jwt.staffSecret, {
    subject: staffId,
    expiresIn: config.jwt.staffTtl,
    algorithm: 'HS256',
  });
}

function readBearer(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

function verify(token, secret, typ) {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return payload.typ === typ ? payload : null;
  } catch {
    return null;
  }
}

async function loadUser(token) {
  const payload = verify(token, config.jwt.userSecret, 'user');
  if (!payload?.sub) return null;
  // Checked against the database on every request, so suspending or deleting an
  // account takes effect immediately even though the token itself hasn't expired.
  const [[user]] = await pool.query(
    `SELECT id, username, email, phone, avatar_key, email_verified_at, status, created_at
       FROM users WHERE id = ?`,
    [payload.sub],
  );
  return user && user.status === 'active' ? user : null;
}

/** Attaches req.user when a valid token is present; never rejects. */
export async function optionalUser(req, res, next) {
  const token = readBearer(req);
  if (token) req.user = (await loadUser(token)) ?? undefined;
  next();
}

export async function requireUser(req, res, next) {
  const token = readBearer(req);
  if (!token) throw unauthorized();
  const user = await loadUser(token);
  if (!user) throw unauthorized('Session is invalid or expired', 'invalid_token');
  req.user = user;
  next();
}

/** Admin staff only. Pass roles to restrict further, e.g. requireStaff('super_admin', 'admin'). */
export function requireStaff(...roles) {
  return async (req, res, next) => {
    const token = readBearer(req);
    if (!token) throw unauthorized();
    const payload = verify(token, config.jwt.staffSecret, 'staff');
    if (!payload?.sub) throw unauthorized('Session is invalid or expired', 'invalid_token');
    const [[staff]] = await pool.query(
      'SELECT id, email, name, role, status FROM admin_staff WHERE id = ?',
      [payload.sub],
    );
    if (!staff || staff.status !== 'active') throw unauthorized('Session is invalid or expired', 'invalid_token');
    if (roles.length && !roles.includes(staff.role)) throw forbidden('Your role cannot do this');
    req.staff = staff;
    next();
  };
}

/**
 * The signed-in person must be an approved seller in good standing. Use after requireUser.
 * Being approved means a staff member approved their application (that creates the seller profile);
 * being in good standing means staff have not suspended them since.
 */
export async function requireSeller(req, res, next) {
  const [[seller]] = await pool.query(
    'SELECT user_id, display_name, status, rating_avg, rating_count, sales_count, approved_at FROM seller_profiles WHERE user_id = ?',
    [req.user.id],
  );
  if (!seller) throw forbidden('Your seller application has not been approved yet', 'not_a_seller');
  if (seller.status === 'revoked') {
    throw forbidden('Your selling privileges were removed. Your account still works for shopping. Contact TSM support.', 'seller_revoked');
  }
  if (seller.status !== 'active') {
    throw forbidden('Your seller account is suspended. Contact TSM support.', 'seller_suspended');
  }
  req.seller = seller;
  next();
}
