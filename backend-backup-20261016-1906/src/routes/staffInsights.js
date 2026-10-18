// Staff: the home screen numbers and the activity record.
//
//   GET /api/staff/dashboard       counts across the whole platform + the latest activity
//   GET /api/staff/audit           ?q, actorType=staff|user|system, action, entityType, from, to, limit, offset
//   GET /api/staff/audit/filters   the action and entity names that exist, for the filter menus
//
// Every change made through the admin site or the apps is written to audit_logs by the route
// that makes it (who, what, which record, when, from which IP). Open to every staff role.
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { earningTotals } from '../lib/earnings.js';
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
            SUM(created_at >= NOW() - INTERVAL 7 DAY) AS joinedThisWeek FROM users WHERE status <> 'deleted'`);
  const sellers = await one(`SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'suspended') AS suspended FROM seller_profiles`);
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
  const money = await earningTotals();
  const [recent] = await pool.query(`${AUDIT_SELECT} ORDER BY a.id DESC LIMIT 12`);
  res.json({
    people,
    sellers,
    applications,
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
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function dayStart(text, endOfDay) {
  if (!text) return null;
  const d = new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

router.get('/audit', read, async (req, res) => {
  const f = parse(auditQuery, req.query);
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
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM (${AUDIT_SELECT} ${whereSql}) x`, params);
  const [rows] = await pool.query(`${AUDIT_SELECT} ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  res.json({ items: rows.map(auditDto), total: Number(total), limit: f.limit, offset: f.offset });
});

router.get('/audit/filters', read, async (req, res) => {
  const [actions] = await pool.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
  const [entities] = await pool.query('SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type');
  res.json({ actions: actions.map((r) => r.action), entityTypes: entities.map((r) => r.entity_type) });
});

export default router;
