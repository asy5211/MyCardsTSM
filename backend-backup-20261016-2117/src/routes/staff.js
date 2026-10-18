// Admin-staff sign-in. Staff are a separate population from app users (own table, own secret).
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { unauthorized } from '../errors.js';
import { audit } from '../lib/audit.js';
import { staffDto } from '../lib/dto.js';
import { burnPasswordTime, verifyPassword } from '../lib/passwords.js';
import { parse } from '../lib/validate.js';
import { requireStaff, signStaffToken } from '../middleware/auth.js';

const router = Router();

const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(200),
});

router.post('/login', async (req, res) => {
  const { email, password } = parse(loginBody, req.body);
  const [[staff]] = await pool.query('SELECT * FROM admin_staff WHERE email = ?', [email]);

  const ok = staff && staff.status === 'active' && (await verifyPassword(password, staff.password_hash));
  if (!ok) {
    if (!staff) await burnPasswordTime(password);
    await audit({
      actorType: 'staff',
      actorId: staff?.id ?? null,
      action: 'staff.login_failed',
      entityType: 'staff',
      entityId: staff?.id ?? null,
      details: { email },
      ip: req.ip,
    });
    throw unauthorized('Incorrect email or password', 'invalid_credentials');
  }

  await pool.query('UPDATE admin_staff SET last_login_at = ? WHERE id = ?', [new Date(), staff.id]);
  await audit({ actorType: 'staff', actorId: staff.id, action: 'staff.login', entityType: 'staff', entityId: staff.id, ip: req.ip });
  res.json({ token: signStaffToken(staff.id, staff.role), staff: staffDto(staff) });
});

router.get('/me', requireStaff(), (req, res) => {
  res.json(staffDto(req.staff));
});

export default router;
