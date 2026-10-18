// "Become a seller": the signed-in person applies (with documents), and can look at their
// application. Staff review happens in staffSellerApplications.js.
//
//   GET  /api/me/seller-application   latest application (or null) with its document list
//   POST /api/me/seller-application   multipart/form-data (or JSON for a "test" application)
//
// Form fields: businessName, businessAddress, contactEmail, phoneNumber?, sourceType,
//              distributorList?, documentTypes? (comma-separated, one per file)
// Files:       documents (up to 5; PDF, JPEG, PNG or HEIC; 10 MB each)
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { HttpError, conflict } from '../errors.js';
import { audit } from '../lib/audit.js';
import {
  DOC_TYPES,
  SOURCE_TYPES,
  applicationDto,
  loadDocuments,
  uniqueDisplayName,
} from '../lib/sellerApplications.js';
import { deleteFiles, newStorageKey, saveFile, sniffFileType } from '../lib/uploads.js';
import { parse } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser);

// ---- Receiving the files ------------------------------------------------------

const receive = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // so filenames like "Permiso—2024.pdf" survive
  limits: {
    fileSize: config.maxUploadBytes,
    files: config.maxApplicationDocuments,
    fields: 20,
    fieldSize: 20 * 1024,
  },
}).array('documents', config.maxApplicationDocuments);

function receiveDocuments(req, res, next) {
  receive(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const mb = Math.round(config.maxUploadBytes / (1024 * 1024));
      const known = {
        LIMIT_FILE_SIZE: new HttpError(413, 'file_too_large', `Each document must be ${mb} MB or smaller`),
        LIMIT_FILE_COUNT: new HttpError(400, 'too_many_files', `Attach at most ${config.maxApplicationDocuments} documents`),
        LIMIT_UNEXPECTED_FILE: new HttpError(400, 'too_many_files', `Attach at most ${config.maxApplicationDocuments} documents`),
      };
      return next(known[err.code] ?? new HttpError(400, 'upload_failed', 'The upload could not be read'));
    }
    return next(err);
  });
}

// ---- Validation ---------------------------------------------------------------

const applicationBody = z.object({
  businessName: z.string().trim().min(2, 'Enter your business name').max(160, 'Business name is too long'),
  businessAddress: z.string().trim().min(5, 'Enter your business address').max(255, 'Business address is too long'),
  contactEmail: z.string().trim().toLowerCase().max(255).email('Enter a valid contact email'),
  phoneNumber: z
    .string()
    .trim()
    .max(30, 'Phone number is too long')
    .optional()
    .transform((v) => (v ? v : null)),
  sourceType: z.enum(SOURCE_TYPES, { error: 'Choose where your products come from' }),
  distributorList: z.string().trim().max(2000, 'Keep the list under 2000 characters').default(''),
  documentTypes: z.string().max(200).optional(),
});

// ---- Routes ---------------------------------------------------------------------

router.get('/', async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT * FROM seller_applications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1',
    [req.user.id],
  );
  if (!row) return res.json({ application: null });
  res.json({ application: applicationDto(row, await loadDocuments(pool, row.id)) });
});

router.post('/', receiveDocuments, async (req, res) => {
  const body = parse(applicationBody, req.body);
  const files = req.files ?? [];
  const isTest = body.sourceType === 'test';

  if (isTest && !config.allowTestSellerAutoApprove) {
    throw new HttpError(400, 'validation_error', 'Some fields are invalid', [
      { field: 'sourceType', message: 'Test applications are turned off on this server' },
    ]);
  }
  if (!isTest && files.length === 0) {
    throw new HttpError(400, 'validation_error', 'Some fields are invalid', [
      { field: 'documents', message: 'Attach at least one document, such as a business licence or permit' },
    ]);
  }

  // Check every file by its contents, and decide its stored type.
  const requestedTypes = (body.documentTypes ?? '').split(',').map((t) => t.trim());
  const documents = files.map((file, index) => {
    const kind = sniffFileType(file.buffer);
    if (!kind) {
      throw new HttpError(400, 'validation_error', 'Some fields are invalid', [
        { field: 'documents', message: `"${file.originalname}" isn't a PDF, JPEG, PNG or HEIC file` },
      ]);
    }
    const requested = requestedTypes[index];
    return { file, kind, docType: DOC_TYPES.includes(requested) ? requested : 'other' };
  });

  // Friendly pre-checks (the database enforces the same rules if two requests race).
  const [[existingProfile]] = await pool.query('SELECT status FROM seller_profiles WHERE user_id = ?', [req.user.id]);
  if (existingProfile?.status === 'active') {
    throw new HttpError(409, 'already_seller', 'Your seller account is already approved');
  }
  if (existingProfile) {
    throw new HttpError(409, 'seller_suspended', 'Your seller account is suspended. Please contact support.');
  }
  const [[open]] = await pool.query(
    "SELECT id FROM seller_applications WHERE user_id = ? AND status IN ('submitted','under_review') LIMIT 1",
    [req.user.id],
  );
  if (open) {
    throw new HttpError(409, 'application_pending', 'You already have an application waiting for review');
  }

  const applicationId = randomUUID();
  const now = new Date();
  const stored = documents.map((d) => ({ ...d, id: randomUUID(), key: newStorageKey(applicationId, d.kind.ext) }));

  try {
    for (const d of stored) await saveFile(d.key, d.file.buffer);

    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO seller_applications
           (id, user_id, business_name, business_address, contact_email, phone_number,
            source_type, distributor_list, status, is_test, decision_note, reviewed_at, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          applicationId,
          req.user.id,
          body.businessName,
          body.businessAddress,
          body.contactEmail,
          body.phoneNumber,
          body.sourceType,
          body.distributorList,
          isTest ? 'approved' : 'submitted',
          isTest ? 1 : 0,
          isTest ? 'Approved automatically: a test application on a development server.' : null,
          isTest ? now : null,
          now,
        ],
      );
      for (const [index, d] of stored.entries()) {
        // One millisecond apart so documents always list in the order they were attached.
        const uploadedAt = new Date(now.getTime() + index);
        await conn.query(
          `INSERT INTO seller_application_documents
             (id, application_id, doc_type, original_filename, storage_key, mime_type, size_bytes, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [d.id, applicationId, d.docType, d.file.originalname.slice(0, 255), d.key, d.kind.mime, d.file.size, uploadedAt],
        );
      }
      await audit(
        {
          actorType: 'user',
          actorId: req.user.id,
          action: 'seller_application.submitted',
          entityType: 'seller_application',
          entityId: applicationId,
          details: { sourceType: body.sourceType, documents: stored.length },
          ip: req.ip,
        },
        conn,
      );

      if (isTest) {
        // Development shortcut only (ALLOW_TEST_SELLER_AUTOAPPROVE): skip the human review.
        const displayName = await uniqueDisplayName(conn, body.businessName);
        await conn.query(
          `INSERT INTO seller_profiles (user_id, display_name, status, approved_at) VALUES (?, ?, 'active', ?)`,
          [req.user.id, displayName, now],
        );
        await audit(
          {
            actorType: 'system',
            action: 'seller_application.auto_approved_test',
            entityType: 'seller_application',
            entityId: applicationId,
            details: { userId: req.user.id, displayName },
            ip: req.ip,
          },
          conn,
        );
      }
    });
  } catch (err) {
    await deleteFiles(stored.map((d) => d.key));
    if (err.code === 'ER_DUP_ENTRY') {
      throw conflict('You already have an application waiting for review');
    }
    throw err;
  }

  const [[row]] = await pool.query('SELECT * FROM seller_applications WHERE id = ?', [applicationId]);
  res.status(201).json({ application: applicationDto(row, await loadDocuments(pool, applicationId)) });
});

export default router;
