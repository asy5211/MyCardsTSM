// Staff: the home screen numbers and the activity record.
//
//   GET /api/staff/dashboard       counts across the whole platform + the latest activity
//   GET /api/staff/audit           ?q, actorType=staff|user|system, action, entityType, from, to, sort=newest|oldest, limit, offset
//   GET /api/staff/audit/filters   the action and entity names that exist, for the filter menus
//   GET /api/staff/audit/export    ?from=YYYY-MM-DD&to=YYYY-MM-DD (both required) + the same filters  ->  a CSV file of that time range
//
// Every change made through the admin site or the apps is written to audit_logs by the route
// that makes it (who, what, which record, when, from which IP). Open to every staff role.
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { audit } from '../lib/audit.js';
import { earningTotals } from '../lib/earnings.js';
import { dir, sortParam } from '../lib/sort.js';
import { parse } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();
const read = requireStaff();
const iso = (d) => (d ? new Date(d).toISOString() : null);
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function auditDto(r) {
  return {
    id: Number(r.id),
    actorType: r.actor_type,
    actorId: r.actor_id ?? null,
    actorName: r.staff_name ?? r.user_name ?? (r.actor_type === 'system' ? 'System' : null),
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details ?? null,
    ip: r.ip_address ?? null,
    createdAt: iso(r.created_at),
  };
}

const AUDIT_SELECT = `
  SELECT a.*, s.name AS staff_name, u.username AS user_name
    FROM audit_logs a
    LEFT JOIN admin_staff s ON a.actor_type = 'staff' AND s.id = a.actor_id
    LEFT JOIN users u ON a.actor_type = 'user' AND u.id = a.actor_id`;

router.get('/dashboard', read, async (req, res) => {
  const one = async (sql) => Object.fromEntries(Object.entries((await pool.query(sql))[0][0]).map(([k, v]) => [k, Number(v ?? 0)]));
  const people = await one(
    `SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'suspended') AS suspended,
            SUM(created_at >= NOW() - INTERVAL 7 DAY) AS joinedThisWeek
       FROM users WHERE status <> 'deleted' AND id NOT IN (SELECT user_id FROM seller_profiles WHERE is_house = 1)`);
  // TSM's own storefront is not a seller to watch or pay, so it is left out of these counts.
  const sellers = await one(`SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'suspended') AS suspended, SUM(status = 'revoked') AS revoked FROM seller_profiles WHERE is_house = 0`);
  const applications = await one(
    `SELECT SUM(status = 'submitted') AS submitted, SUM(status = 'under_review') AS underReview,
            SUM(status IN ('submitted','under_review')) AS waiting FROM seller_applications`);
  const products = await one(
    `SELECT COUNT(*) AS total, SUM(is_active = 1) AS active,
            SUM(is_active = 1 AND description IS NOT NULL AND CHAR_LENGTH(TRIM(description)) >= 10
                AND EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = products.id AND i.slot = 1 AND i.image_key LIKE 'products/%')) AS ready
       FROM products`);
  const listings = await one(
    `SELECT COUNT(*) AS total,
            SUM(l.is_active = 1 AND l.admin_hold = 0 AND sp.status = 'active' AND l.quantity_available > 0) AS live,
            SUM(l.admin_hold = 0 AND l.is_active = 0) AS paused,
            SUM(l.admin_hold = 1) AS onHold,
            SUM(l.admin_hold = 0 AND l.is_active = 1 AND sp.status = 'active' AND l.quantity_available = 0) AS soldOut,
            COALESCE(SUM(CASE WHEN l.is_active = 1 AND l.admin_hold = 0 AND sp.status = 'active' THEN l.quantity_available END), 0) AS unitsInStock,
            COALESCE(SUM(CASE WHEN l.is_active = 1 AND l.admin_hold = 0 AND sp.status = 'active' THEN l.quantity_available * l.price END), 0) AS inventoryValue
       FROM listings l JOIN seller_profiles sp ON sp.user_id = l.seller_id`);
  const payouts = await one(`SELECT COALESCE(SUM(status = 'pending'), 0) AS pendingCount FROM payouts`);
  const tickets = await one(
    `SELECT COALESCE(SUM(status = 'submitted'), 0) AS pending, COALESCE(SUM(status = 'countered'), 0) AS countered,
            COALESCE(SUM(status IN ('submitted','in_review','offer_sent','countered')), 0) AS open,
            COALESCE(SUM(status = 'accepted'), 0) AS toPay
       FROM sell_tickets`);
  const support = await one(`SELECT COALESCE(SUM(status = 'open'), 0) AS open FROM support_requests`);
  const orders = await one(`SELECT COUNT(*) AS total, COALESCE(SUM(status = 'placed'), 0) AS toShip FROM orders`);
  const money = await earningTotals();
  const [recent] = await pool.query(`${AUDIT_SELECT} ORDER BY a.id DESC LIMIT 12`);
  res.json({
    people,
    sellers,
    applications,
    tickets,
    support,
    orders,
    products,
    listings: { ...listings, inventoryValueCents: Math.round(listings.inventoryValue * 100), inventoryValue: undefined },
    money: { ...money, pendingPayouts: payouts.pendingCount },
    recentActivity: recent.map(auditDto),
  });
});

const auditQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  actorType: z.enum(['staff', 'user', 'system']).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  entityType: z.string().trim().min(1).max(60).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  sort: sortParam(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function dayStart(text, endOfDay) {
  if (!text) return null;
  const d = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  // JavaScript quietly turns 2026-02-30 into March 2, so check the date reads back the same.
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? null : d;
}

/** The WHERE clause shared by the on-screen list and the CSV export. */
function auditFilters(f) {
  const where = [];
  const params = [];
  if (f.actorType) { where.push('a.actor_type = ?'); params.push(f.actorType); }
  if (f.action) { where.push('a.action = ?'); params.push(f.action); }
  if (f.entityType) { where.push('a.entity_type = ?'); params.push(f.entityType); }
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    where.push('(a.action LIKE ? OR a.entity_id = ? OR a.actor_id = ? OR s.name LIKE ? OR u.username LIKE ? OR CAST(a.details AS CHAR) LIKE ?)');
    params.push(like, f.q, f.q, like, like, like);
  }
  const from = dayStart(f.from, false);
  const to = dayStart(f.to, true);
  if (from) { where.push('a.created_at >= ?'); params.push(from); }
  if (to) { where.push('a.created_at <= ?'); params.push(to); }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get('/audit', read, async (req, res) => {
  const f = parse(auditQuery, req.query);
  const { whereSql, params } = auditFilters(f);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM (${AUDIT_SELECT} ${whereSql}) x`, params);
  const [rows] = await pool.query(`${AUDIT_SELECT} ${whereSql} ORDER BY a.id ${dir(f.sort)} LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  res.json({ items: rows.map(auditDto), total: Number(total), limit: f.limit, offset: f.offset });
});

// ---- CSV export: always a time range, never the whole log -----------------------------

export const EXPORT_MAX_DAYS = 366;
export const EXPORT_MAX_ROWS = 20000;

const exportQuery = z.object({
  from: z.string({ error: 'Choose a start date' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'),
  to: z.string({ error: 'Choose an end date' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an end date'),
  q: auditQuery.shape.q,
  actorType: auditQuery.shape.actorType,
  action: auditQuery.shape.action,
  entityType: auditQuery.shape.entityType,
});

/** One CSV cell. A leading = + - @ is defused so a spreadsheet never runs it as a formula. */
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

router.get('/audit/export', read, async (req, res) => {
  const f = parse(exportQuery, req.query);
  const from = dayStart(f.from, false);
  const to = dayStart(f.to, true);
  if (!from) throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'from', message: 'Choose a real start date' }]);
  if (!to) throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'to', message: 'Choose a real end date' }]);
  if (from > to) throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'to', message: 'The end date is before the start date' }]);
  const days = Math.round((to - from) / 86_400_000);
  if (days > EXPORT_MAX_DAYS) {
    throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'to', message: `Choose a range of at most ${EXPORT_MAX_DAYS} days` }]);
  }
  const { whereSql, params } = auditFilters(f);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM (${AUDIT_SELECT} ${whereSql}) x`, params);
  if (Number(total) > EXPORT_MAX_ROWS) {
    throw new HttpError(400, 'too_many_rows', `That range has ${Number(total)} entries. Choose a shorter range (the limit is ${EXPORT_MAX_ROWS}).`, [
      { field: 'to', message: `Too many entries (${Number(total)}); the limit is ${EXPORT_MAX_ROWS}` },
    ]);
  }
  const [rows] = await pool.query(`${AUDIT_SELECT} ${whereSql} ORDER BY a.id ASC`, params);
  const head = ['id', 'time_utc', 'actor_type', 'actor_name', 'actor_id', 'action', 'entity_type', 'entity_id', 'ip_address', 'details'];
  const lines = [head.join(',')];
  for (const r of rows.map(auditDto)) {
    lines.push([r.id, r.createdAt, r.actorType, r.actorName, r.actorId, r.action, r.entityType, r.entityId, r.ip, r.details ? JSON.stringify(r.details) : '']
      .map(csvCell).join(','));
  }
  await audit({
    actorType: 'staff', actorId: req.staff.id, ip: req.ip, action: 'audit.exported', entityType: 'audit',
    details: { from: f.from, to: f.to, rows: rows.length, filters: { q: f.q ?? null, actorType: f.actorType ?? null, action: f.action ?? null, entityType: f.entityType ?? null } },
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tsm-activity-${f.from}_to_${f.to}.csv"`);
  res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
});

router.get('/audit/filters', read, async (req, res) => {
  const [actions] = await pool.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
  const [entities] = await pool.query('SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type');
  res.json({ actions: actions.map((r) => r.action), entityTypes: entities.map((r) => r.entity_type) });
});

export default router;
