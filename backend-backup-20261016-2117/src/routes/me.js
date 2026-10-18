// The signed-in user's own account: profile, password, data export, and deletion.
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { conflict, unauthorized } from '../errors.js';
import { audit } from '../lib/audit.js';
import { deleteFiles } from '../lib/uploads.js';
import { iso, userDto } from '../lib/dto.js';
import { toCents } from '../lib/money.js';
import { US_STATE_CODES } from '../lib/usStates.js';
import { hashPassword, passwordSchema, verifyPassword } from '../lib/passwords.js';
import { phoneSchema } from '../lib/phone.js';
import { parse } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser);

async function loadSellerInfo(userId) {
  const [[profile]] = await pool.query(
    `SELECT display_name, status, rating_avg, rating_count, sales_count, approved_at, suspended_reason, revoked_reason
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

function addressDto(row) {
  return row
    ? {
        fullName: row.full_name,
        line1: row.line1,
        line2: row.line2 ?? null,
        city: row.city,
        region: row.region,
        postalCode: row.postal_code,
        country: row.country,
      }
    : null;
}

async function loadAddress(userId, executor = pool) {
  const [[row]] = await executor.query('SELECT * FROM user_addresses WHERE user_id = ?', [userId]);
  return row;
}

async function buildMe(user) {
  const { profile, application } = await loadSellerInfo(user.id);
  const address = await loadAddress(user.id);
  return {
    ...userDto(user),
    // The saved shipping address, or null. Checkout asks for one when it is null.
    address: addressDto(address),
    // "Approved seller" = has an active seller profile. The app uses this to choose
    // between the application form and the sell-to-us item form.
    isApprovedSeller: profile?.status === 'active',
    sellerProfile: profile
      ? {
          displayName: profile.display_name,
          // active | suspended | revoked. Only "active" can sell; the other two carry the reason staff gave.
          status: profile.status,
          statusNote: profile.status === 'revoked' ? profile.revoked_reason : profile.status === 'suspended' ? profile.suspended_reason : null,
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
    // Blank clears it; anything else must be a 10-digit US number and is stored as +1 (555) - 123 - 4567.
    phone: phoneSchema.nullable().optional(),
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
    values.push(body.phone ?? null);
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

// ---- Shipping address ---------------------------------------------------------

const optionalLine = z
  .string()
  .trim()
  .max(120, 'Keep this under 120 characters')
  .nullish()
  .transform((v) => (v ? v : null));

const addressBody = z
  .object({
    fullName: z.string().trim().min(2, 'Enter the name for the package').max(100, 'Name is too long'),
    line1: z.string().trim().min(3, 'Enter your street address').max(120, 'Keep this under 120 characters'),
    line2: optionalLine,
    city: z.string().trim().min(2, 'Enter your city').max(80, 'City is too long'),
    region: z.string().trim().max(80, 'State is too long'), // checked below, because the rule depends on the country
    postalCode: z.string().trim().min(3, 'Enter your ZIP code').max(20, 'ZIP code is too long'),
    country: z
      .string()
      .trim()
      .length(2, 'Use a 2-letter country code, such as US')
      .transform((v) => v.toUpperCase())
      .default('US'),
  })
  .superRefine((a, ctx) => {
    if (a.country === 'US' && !/^\d{5}(-\d{4})?$/.test(a.postalCode)) {
      ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Enter a 5-digit ZIP code, like 78701' });
    }
    // Only the 2-letter code ("OH"), never the spelled-out name ("Ohio"), so addresses stay consistent.
    if (a.country === 'US') {
      if (!US_STATE_CODES.has(a.region.toUpperCase())) {
        ctx.addIssue({ code: 'custom', path: ['region'], message: 'Choose your state using its 2-letter code, like OH' });
      }
    } else if (a.region.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['region'], message: 'Enter your state or region' });
    }
  })
  .transform((a) => (a.country === 'US' ? { ...a, region: a.region.toUpperCase() } : a));

router.get('/address', async (req, res) => {
  res.json({ address: addressDto(await loadAddress(req.user.id)) });
});

router.put('/address', async (req, res) => {
  const a = parse(addressBody, req.body);
  await pool.query(
    `INSERT INTO user_addresses (user_id, full_name, line1, line2, city, region, postal_code, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), line1 = VALUES(line1), line2 = VALUES(line2),
       city = VALUES(city), region = VALUES(region), postal_code = VALUES(postal_code), country = VALUES(country)`,
    [req.user.id, a.fullName, a.line1, a.line2, a.city, a.region, a.postalCode, a.country],
  );
  // The address itself is personal data, so the log records only that it changed.
  await audit({ actorType: 'user', actorId: req.user.id, action: 'user.address_updated', entityType: 'user', entityId: req.user.id, ip: req.ip });
  res.json({ address: addressDto(await loadAddress(req.user.id)) });
});

router.delete('/address', async (req, res) => {
  await pool.query('DELETE FROM user_addresses WHERE user_id = ?', [req.user.id]);
  res.status(204).end();
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
  const address = await loadAddress(userId);
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

  const [orders] = await pool.query(
    `SELECT o.*, sp.display_name AS seller_name FROM orders o JOIN seller_profiles sp ON sp.user_id = o.seller_id WHERE o.buyer_id = ? ORDER BY o.created_at`,
    [userId],
  );
  const [orderItems] = orders.length
    ? await pool.query('SELECT * FROM order_items WHERE order_id IN (?)', [orders.map((o) => o.id)])
    : [[]];
  const [reviews] = await pool.query(
    'SELECT r.*, p.name AS product_name FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.buyer_id = ? ORDER BY r.created_at',
    [userId],
  );
  const [tickets] = await pool.query('SELECT * FROM sell_tickets WHERE user_id = ? ORDER BY created_at', [userId]);
  const [support] = await pool.query('SELECT * FROM support_requests WHERE user_id = ? ORDER BY created_at', [userId]);

  const body = {
    exportedAt: new Date().toISOString(),
    account: {
      ...userDto(user),
      termsAcceptedAt: iso(user.terms_accepted_at),
      termsVersion: user.terms_version,
      lastLoginAt: iso(user.last_login_at),
    },
    shippingAddress: addressDto(address),
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
    orders: orders.map((o) => ({
      orderNumber: o.order_number,
      status: o.status,
      placedAt: iso(o.created_at),
      seller: o.seller_name,
      subtotalCents: Number(o.subtotal_cents),
      carrier: o.carrier,
      trackingNumber: o.tracking_number,
      items: orderItems
        .filter((i) => i.order_id === o.id)
        .map((i) => ({ product: i.product_name, quantity: Number(i.quantity), unitPriceCents: Number(i.unit_price_cents), box: i.box_label })),
    })),
    reviewsWritten: reviews.map((r) => ({ product: r.product_name, rating: Number(r.rating), comment: r.comment, sellerResponse: r.seller_response, createdAt: iso(r.created_at) })),
    sellTickets: tickets.map((t) => ({ ticketNumber: t.ticket_number, status: t.status, offerCents: t.offer_cents === null ? null : Number(t.offer_cents), createdAt: iso(t.created_at) })),
    supportRequests: support.map((s) => ({ ref: s.ref, topic: s.topic, subject: s.subject, status: s.status, createdAt: iso(s.created_at) })),
    // Notifications join this export when they ship.
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

  // Remember which uploaded files belong to this person; they are deleted from disk once the database change commits.
  const [storedFiles] = await pool.query(
    `SELECT d.storage_key FROM seller_application_documents d
       JOIN seller_applications a ON a.id = d.application_id WHERE a.user_id = ?`,
    [userId],
  );

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
    await conn.query('DELETE FROM user_addresses WHERE user_id = ?', [userId]);
    // Support requests keep their text for TSM's records but lose the name and email. Where a finished order shipped to
    // is no longer needed, so it is blanked too (an order still on its way keeps its address until it arrives).
    await conn.query("UPDATE support_requests SET name = 'Deleted user', email = 'removed@deleted.invalid' WHERE user_id = ?", [userId]);
    await conn.query(
      `UPDATE orders SET ship_name = '[removed]', ship_line1 = '[removed]', ship_line2 = NULL, ship_city = '[removed]', ship_postal_code = '[removed]'
        WHERE buyer_id = ? AND status IN ('delivered', 'cancelled')`,
      [userId],
    );

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
    // An application still waiting for review is closed out, so staff aren't left reviewing a person who is gone.
    await conn.query(
      `UPDATE seller_applications
          SET status = 'declined', decision_note = 'The applicant deleted their account.', reviewed_at = ?
        WHERE user_id = ? AND status IN ('submitted','under_review')`,
      [new Date(), userId],
    );
    await audit(
      { actorType: 'user', actorId: userId, action: 'user.deleted', entityType: 'user', entityId: userId, ip: req.ip },
      conn,
    );
  });

  await deleteFiles(storedFiles.map((f) => f.storage_key));
  res.status(204).end();
});

export default router;
