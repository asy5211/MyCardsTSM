// Staff review of seller applications (the admin site's "Seller applications" queue).
//
//   GET  /api/staff/seller-applications                    list (default: waiting ones, oldest first)
//   GET  /api/staff/seller-applications/:id                one application + applicant + documents
//   GET  /api/staff/seller-applications/:id/documents/:docId   the uploaded file itself
//   POST /api/staff/seller-applications/:id/start-review   mark "under review"
//   POST /api/staff/seller-applications/:id/approve        creates the seller profile
//   POST /api/staff/seller-applications/:id/decline        needs a note for the applicant
//
// Anyone on staff can look; only admin and super_admin can decide. Every action is audited.
import { basename } from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { iso } from '../lib/dto.js';
import { OPEN_STATUSES, applicationDto, loadDocuments, uniqueDisplayName } from '../lib/sellerApplications.js';
import { pathForKey } from '../lib/uploads.js';
import { UUID_RE, parse } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();
const STATUSES = ['submitted', 'under_review', 'approved', 'declined'];
const canDecide = requireStaff('super_admin', 'admin');

router.use(requireStaff());

function requireUuid(value, what = 'application') {
  if (!UUID_RE.test(value)) throw notFound(`No such ${what}`);
  return value;
}

// ---- List -----------------------------------------------------------------------

const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : OPEN_STATUSES))
    .pipe(z.array(z.enum(STATUSES, { error: 'status must be submitted, under_review, approved or declined' })).min(1)),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/', async (req, res) => {
  const { status, limit, offset } = parse(listQuery, req.query);
  const waiting = status.every((s) => OPEN_STATUSES.includes(s));
  const placeholders = status.map(() => '?').join(', ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM seller_applications WHERE status IN (${placeholders})`,
    status,
  );
  const [rows] = await pool.query(
    `SELECT a.*, u.username AS applicant_username, u.email AS applicant_email,
            (SELECT COUNT(*) FROM seller_application_documents d WHERE d.application_id = a.id) AS document_count
       FROM seller_applications a
       JOIN users u ON u.id = a.user_id
      WHERE a.status IN (${placeholders})
      ORDER BY a.submitted_at ${waiting ? 'ASC' : 'DESC'}, a.id
      LIMIT ? OFFSET ?`,
    [...status, limit, offset],
  );

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      businessName: row.business_name,
      sourceType: row.source_type,
      status: row.status,
      isTest: Boolean(row.is_test),
      submittedAt: iso(row.submitted_at),
      reviewedAt: iso(row.reviewed_at),
      documentCount: Number(row.document_count),
      applicant: { id: row.user_id, username: row.applicant_username, email: row.applicant_email },
    })),
    total: Number(total),
    limit,
    offset,
  });
});

// ---- One application ----------------------------------------------------------------

async function loadDetail(id) {
  const [[row]] = await pool.query(
    `SELECT a.*, u.username AS applicant_username, u.email AS applicant_email,
            s.name AS reviewer_name
       FROM seller_applications a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN admin_staff s ON s.id = a.reviewed_by_staff_id
      WHERE a.id = ?`,
    [id],
  );
  if (!row) throw notFound('No such application');
  const documents = await loadDocuments(pool, id);
  const [[profile]] = await pool.query('SELECT display_name, status FROM seller_profiles WHERE user_id = ?', [row.user_id]);
  return {
    ...applicationDto(row, documents),
    applicant: { id: row.user_id, username: row.applicant_username, email: row.applicant_email },
    reviewedBy: row.reviewer_name ?? null,
    sellerProfile: profile ? { displayName: profile.display_name, status: profile.status } : null,
  };
}

router.get('/:id', async (req, res) => {
  res.json({ application: await loadDetail(requireUuid(req.params.id)) });
});

router.get('/:id/documents/:docId', async (req, res) => {
  const applicationId = requireUuid(req.params.id);
  const docId = requireUuid(req.params.docId, 'document');
  const [[doc]] = await pool.query(
    `SELECT d.* FROM seller_application_documents d WHERE d.id = ? AND d.application_id = ?`,
    [docId, applicationId],
  );
  if (!doc) throw notFound('No such document');

  await audit({
    actorType: 'staff',
    actorId: req.staff.id,
    action: 'seller_application.document_viewed',
    entityType: 'seller_application',
    entityId: applicationId,
    details: { documentId: docId },
    ip: req.ip,
  });

  const safeName = basename(doc.original_filename).replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(pathForKey(doc.storage_key), { dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: { code: 'file_missing', message: 'The stored file could not be found' } });
    }
  });
});

// ---- Decisions ----------------------------------------------------------------------

/** Locks the application row so two staff members can't decide the same one at once. */
async function lockApplication(conn, id) {
  const [[row]] = await conn.query('SELECT * FROM seller_applications WHERE id = ? FOR UPDATE', [id]);
  if (!row) throw notFound('No such application');
  return row;
}

function alreadyDecided(row) {
  return new HttpError(409, 'already_decided', `This application was already ${row.status}`);
}

router.post('/:id/start-review', canDecide, async (req, res) => {
  const id = requireUuid(req.params.id);
  await withTransaction(async (conn) => {
    const row = await lockApplication(conn, id);
    if (row.status === 'under_review') return; // already marked; nothing to do
    if (row.status !== 'submitted') throw alreadyDecided(row);
    await conn.query("UPDATE seller_applications SET status = 'under_review' WHERE id = ?", [id]);
    await audit(
      { actorType: 'staff', actorId: req.staff.id, action: 'seller_application.under_review', entityType: 'seller_application', entityId: id, ip: req.ip },
      conn,
    );
  });
  res.json({ application: await loadDetail(id) });
});

const approveBody = z.object({
  displayName: z.string().trim().min(2, 'Store name must be at least 2 characters').max(80, 'Store name must be at most 80 characters').optional(),
  note: z.string().trim().max(500).optional(),
});

router.post('/:id/approve', canDecide, async (req, res) => {
  const id = requireUuid(req.params.id);
  const body = parse(approveBody, req.body);

  await withTransaction(async (conn) => {
    const row = await lockApplication(conn, id);
    if (!OPEN_STATUSES.includes(row.status)) throw alreadyDecided(row);

    const [[existing]] = await conn.query('SELECT status FROM seller_profiles WHERE user_id = ?', [row.user_id]);
    if (existing) throw new HttpError(409, 'already_seller', 'This person already has a seller account');

    // Staff picked a store name: it must be free. Otherwise use the business name, adding a number if needed.
    let displayName;
    if (body.displayName) {
      const [[taken]] = await conn.query('SELECT 1 AS taken FROM seller_profiles WHERE display_name = ?', [body.displayName]);
      if (taken) {
        throw new HttpError(409, 'display_name_taken', 'That store name is already in use', [
          { field: 'displayName', message: 'That store name is already in use' },
        ]);
      }
      displayName = body.displayName;
    } else {
      displayName = await uniqueDisplayName(conn, row.business_name);
    }

    const now = new Date();
    await conn.query(
      `INSERT INTO seller_profiles (user_id, display_name, status, approved_at, approved_by_staff_id)
       VALUES (?, ?, 'active', ?, ?)`,
      [row.user_id, displayName, now, req.staff.id],
    );
    await conn.query(
      `UPDATE seller_applications
          SET status = 'approved', reviewed_by_staff_id = ?, reviewed_at = ?, decision_note = ?
        WHERE id = ?`,
      [req.staff.id, now, body.note || null, id],
    );
    await audit(
      {
        actorType: 'staff',
        actorId: req.staff.id,
        action: 'seller_application.approved',
        entityType: 'seller_application',
        entityId: id,
        details: { userId: row.user_id, displayName },
        ip: req.ip,
      },
      conn,
    );
  });

  res.json({ application: await loadDetail(id) });
});

const declineBody = z.object({
  note: z.string().trim().min(3, 'Tell the applicant why (at least 3 characters)').max(500, 'Keep the note under 500 characters'),
});

router.post('/:id/decline', canDecide, async (req, res) => {
  const id = requireUuid(req.params.id);
  const { note } = parse(declineBody, req.body);

  await withTransaction(async (conn) => {
    const row = await lockApplication(conn, id);
    if (!OPEN_STATUSES.includes(row.status)) throw alreadyDecided(row);
    await conn.query(
      `UPDATE seller_applications
          SET status = 'declined', reviewed_by_staff_id = ?, reviewed_at = ?, decision_note = ?
        WHERE id = ?`,
      [req.staff.id, new Date(), note, id],
    );
    await audit(
      {
        actorType: 'staff',
        actorId: req.staff.id,
        action: 'seller_application.declined',
        entityType: 'seller_application',
        entityId: id,
        details: { userId: row.user_id },
        ip: req.ip,
      },
      conn,
    );
  });

  res.json({ application: await loadDetail(id) });
});

export default router;
