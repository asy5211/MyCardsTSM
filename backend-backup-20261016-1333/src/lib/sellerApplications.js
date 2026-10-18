// Shared pieces for seller applications: JSON shapes and the "approve" step used by both
// the staff review screen and the development-only "test" auto-approval.
import { iso } from './dto.js';

export const SOURCE_TYPES = ['distributor', 'retail_store', 'manufacturer_direct', 'other', 'test'];
export const DOC_TYPES = ['city_permit', 'business_license', 'tax_permit', 'other'];
export const OPEN_STATUSES = ['submitted', 'under_review'];

export function documentDto(row) {
  return {
    id: row.id,
    type: row.doc_type,
    filename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: iso(row.uploaded_at),
  };
}

export function applicationDto(row, documents = []) {
  return {
    id: row.id,
    businessName: row.business_name,
    businessAddress: row.business_address,
    contactEmail: row.contact_email,
    phoneNumber: row.phone_number ?? null,
    sourceType: row.source_type,
    distributorList: row.distributor_list,
    status: row.status,
    isTest: Boolean(row.is_test),
    decisionNote: row.decision_note ?? null,
    submittedAt: iso(row.submitted_at),
    reviewedAt: iso(row.reviewed_at),
    documents: documents.map(documentDto),
  };
}

export async function loadDocuments(executor, applicationId) {
  const [rows] = await executor.query(
    `SELECT id, doc_type, original_filename, mime_type, size_bytes, uploaded_at
       FROM seller_application_documents WHERE application_id = ? ORDER BY uploaded_at, id`,
    [applicationId],
  );
  return rows;
}

/**
 * Makes a store name that isn't taken yet: "Lone Star Cards", then "Lone Star Cards 2", ...
 * Call inside the same transaction that inserts the seller profile.
 */
export async function uniqueDisplayName(conn, wanted) {
  const base = wanted.trim().slice(0, 80);
  for (let n = 1; n <= 50; n += 1) {
    const suffix = n === 1 ? '' : ` ${n}`;
    const candidate = base.slice(0, 80 - suffix.length) + suffix;
    const [[taken]] = await conn.query('SELECT 1 AS taken FROM seller_profiles WHERE display_name = ?', [candidate]);
    if (!taken) return candidate;
  }
  return `${base.slice(0, 60)} ${Date.now()}`;
}
