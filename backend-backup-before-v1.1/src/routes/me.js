// The signed-in user's own account: profile, password, data export, and deletion.
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { conflict, unauthorized } from '../errors.js';
import { audit } from '../lib/audit.js';
import { iso, userDto } from '../lib/dto.js';
import { toCents } from '../lib/money.js';
import { hashPassword, passwordSchema, verifyPassword } from '../lib/passwords.js';
import { parse } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser);

async function loadSellerInfo(userId) {
  const [[profile]] = await pool.query(
    `SELECT display_name, status, rating_avg, rating_count, sales_count, approved_at
       FROM seller_profiles WHERE user_id = ?`,
    [userId],
  );
  const [[application]] = await pool.query(
    `SELECT id, status, decision_note, submitted_at, reviewed_at
       FROM seller_applications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1`,
    [userId],
  );
  return { profile, application };
}

async function buildMe(user) {
  const { profile, application } = await loadSellerInfo(user.id);
  return {
    ...userDto(user),
    // "Approved seller" = has an active seller profile. The app uses this to choose
    // between the application form and the sell-to-us item form.
    isApprovedSeller: profile?.status === 'active',
    sellerProfile: profile
      ? {
          displayName: profile.display_name,
          status: profile.status,
          rating: Number(profile.rating_avg),
          ratingCount: profile.rating_count,
          salesCount: profile.sales_count,
          approvedAt: iso(profile.approved_at),
        }
      : null,
    sellerApplication: application
      ? {
          id: application.id,
          status: application.status,
          decisionNote: application.decision_note,
          submittedAt: iso(application.submitted_at),
          reviewedAt: iso(application.reviewed_at),
        }
      : null,
  };
}

router.get('/', async (req, res) => {
  res.json(await buildMe(req.user));
});

const patchBody = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[A-Za-z0-9_.-]+$/, 'Username may only use letters, numbers, dot, dash and underscore')
      .optional(),
    phone: z.string().trim().max(30).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Send at least one field to change' });

router.patch('/', async (req, res) => {
  const body = parse(patchBody, req.body);
  const sets = [];
  const values = [];
  if (body.username !== undefined) {
    sets.push('username = ?');
    values.push(body.username);
  }
  if (body.phone !== undefined) {
    sets.push('phone = ?');
    values.push(body.phone === '' ? null : body.phone);
  }
  try {
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, req.user.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw conflict('That username is already taken', [{ field: 'username', message: 'That username is already taken' }]);
    }
    throw err;
  }
  const [[fresh]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json(await buildMe(fresh));
});

const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one',
  });

async function requireCurrentPassword(userId, password) {
  const [[row]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw unauthorized('Current password is incorrect', 'invalid_credentials');
  }
}

router.post('/change-password', async (req, res) => {
  const body = parse(changePasswordBody, req.body);
  await requireCurrentPassword(req.user.id, body.currentPassword);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(body.newPassword), req.user.id]);
  await audit({ actorType: 'user', actorId: req.user.id, action: 'user.password_changed', entityType: 'user', entityId: req.user.id, ip: req.ip });
  res.json({ message: 'Password updated' });
});

// ---- Data export (App Store / privacy requirement) ---------------------------

router.get('/export', async (req, res) => {
  const userId = req.user.id;
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  const { profile, application } = await loadSellerInfo(userId);
  const [applications] = await pool.query(
    `SELECT id, business_name, business_address, contact_email, phone_number, source_type, distributor_list,
            status, decision_note, submitted_at, reviewed_at
       FROM seller_applications WHERE user_id = ? ORDER BY submitted_at`,
    [userId],
  );
  const [documents] = await pool.query(
    `SELECT d.application_id, d.doc_type, d.original_filename, d.mime_type, d.size_bytes, d.uploaded_at
       FROM seller_application_documents d
       JOIN seller_applications a ON a.id = d.application_id
      WHERE a.user_id = ?`,
    [userId],
  );
  const [listings] = await pool.query(
    `SELECT l.id, p.name AS product, l.price, l.source, l.box_position, l.condition_label,
            l.quantity_available, l.is_active, l.created_at
       FROM listings l JOIN products p ON p.id = l.product_id
      WHERE l.seller_id = ?`,
    [userId],
  );

  const body = {
    exportedAt: new Date().toISOString(),
    account: {
      ...userDto(user),
      termsAcceptedAt: iso(user.terms_accepted_at),
      termsVersion: user.terms_version,
      lastLoginAt: iso(user.last_login_at),
    },
    sellerProfile: profile
      ? { displayName: profile.display_name, status: profile.status, rating: Number(profile.rating_avg), salesCount: profile.sales_count }
      : null,
    latestSellerApplicationStatus: application?.status ?? null,
    sellerApplications: applications.map((a) => ({
      id: a.id,
      businessName: a.business_name,
      businessAddress: a.business_address,
      contactEmail: a.contact_email,
      phoneNumber: a.phone_number,
      sourceType: a.source_type,
      distributorList: a.distributor_list,
      status: a.status,
      decisionNote: a.decision_note,
      submittedAt: iso(a.submitted_at),
      reviewedAt: iso(a.reviewed_at),
      documents: documents
        .filter((d) => d.application_id === a.id)
        .map((d) => ({ type: d.doc_type, filename: d.original_filename, mimeType: d.mime_type, sizeBytes: d.size_bytes, uploadedAt: iso(d.uploaded_at) })),
    })),
    listings: listings.map((l) => ({
      id: l.id,
      product: l.product,
      priceCents: toCents(l.price),
      source: l.source,
      boxPosition: l.box_position,
      condition: l.condition_label,
      quantityAvailable: l.quantity_available,
      active: Boolean(l.is_active),
      createdAt: iso(l.created_at),
    })),
    // Orders, reviews, notifications and support tickets join this export as those features ship.
  };

  await audit({ actorType: 'user', actorId: userId, action: 'user.data_exported', entityType: 'user', entityId: userId, ip: req.ip });
  res.setHeader('Content-Disposition', 'attachment; filename="tsm-data-export.json"');
  res.json(body);
});

// ---- Account deletion (App Store requirement) --------------------------------

const deleteBody = z.object({ password: z.string().min(1, 'Enter your password to confirm') });

router.delete('/', async (req, res) => {
  const { password } = parse(deleteBody, req.body);
  await requireCurrentPassword(req.user.id, password);

  const userId = req.user.id;
  const short = userId.slice(0, 8);

  await withTransaction(async (conn) => {
    // The account row stays (orders will keep pointing at it) but every personal detail is overwritten.
    await conn.query(
      `UPDATE users
          SET username = ?, email = ?, phone = NULL, avatar_key = NULL,
              password_hash = ?, status = 'deleted', deleted_at = ?
        WHERE id = ?`,
      [`deleted_${short}`, `deleted+${userId}@deleted.invalid`, await hashPassword(randomBytes(32).toString('hex')), new Date(), userId],
    );
    await conn.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);

    // A seller leaving: pull every offer off the shop and anonymise the store name.
    await conn.query('UPDATE listings SET is_active = 0 WHERE seller_id = ?', [userId]);
    await conn.query(
      "UPDATE seller_profiles SET status = 'suspended', display_name = ? WHERE user_id = ?",
      [`Closed store ${short}`, userId],
    );

    // Application details are personal/business data: blank them and drop the uploaded-document records.
    await conn.query(
      `UPDATE seller_applications
          SET business_address = '[removed]', contact_email = 'removed@deleted.invalid',
              phone_number = NULL, distributor_list = '[removed]'
        WHERE user_id = ?`,
      [userId],
    );
    await conn.query(
      'DELETE d FROM seller_application_documents d JOIN seller_applications a ON a.id = d.application_id WHERE a.user_id = ?',
      [userId],
    );
    await audit(
      { actorType: 'user', actorId: userId, action: 'user.deleted', entityType: 'user', entityId: userId, ip: req.ip },
      conn,
    );
  });

  res.status(204).end();
});

export default router;
