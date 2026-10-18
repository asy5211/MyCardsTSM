// Support requests: who wrote them, which order and seller they are about, and who is answering.
//
// A request about an order goes to that order's seller (handler = 'seller') and shows up in the seller portal;
// TSM staff can always read and answer it too. If the seller does a poor job, staff TAKE OVER (handler = 'tsm'):
// the seller can no longer reply, and staff can HAND BACK later. Requests with no order (account, payment, a guest's
// question, or an order of TSM's own store) are TSM's from the start.
import { pool } from '../db.js';
import { dir } from './sort.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

export const SUPPORT_STATUSES = ['open', 'answered', 'closed'];
export const SUPPORT_TOPICS = ['account', 'order', 'selling', 'payment', 'other'];

const SUPPORT_FROM = `
  FROM support_requests s
  LEFT JOIN users u ON u.id = s.user_id
  LEFT JOIN orders o ON o.id = s.order_id
  LEFT JOIN seller_profiles sp ON sp.user_id = s.seller_id
  LEFT JOIN admin_staff st ON st.id = s.taken_over_by_staff_id`;

export const SUPPORT_SELECT = `
  SELECT s.*, u.username, u.status AS user_status, o.order_number, sp.display_name AS seller_name, sp.is_house AS seller_is_house,
         st.name AS taken_over_by_name
  ${SUPPORT_FROM}`;

/** What a buyer or staff member sees. Staff also get who took the request over. */
export function supportDto(row) {
  return {
    id: row.id,
    ref: row.ref,
    topic: row.topic,
    subject: row.subject,
    status: row.status,
    name: row.name,
    email: row.email,
    isGuest: row.user_id === null,
    orderId: row.order_id ?? null,
    orderNumber: row.order_number ?? null,
    seller: row.seller_id ? { id: row.seller_id, displayName: row.seller_name ?? null, isTsm: Boolean(row.seller_is_house) } : null,
    // 'seller' = the order's seller is answering; 'tsm' = TSM staff are (always the case when there is no seller).
    handler: row.seller_id ? row.handler : 'tsm',
    takenOverAt: iso(row.taken_over_at),
    takenOverBy: row.taken_over_by_name ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** What a seller sees: the buyer's username only, never their name or email. */
export function sellerSupportDto(row) {
  return {
    id: row.id,
    ref: row.ref,
    topic: row.topic,
    subject: row.subject,
    status: row.status,
    buyer: { username: row.user_status === 'deleted' ? 'TSM buyer' : (row.username ?? 'TSM buyer') },
    orderId: row.order_id ?? null,
    orderNumber: row.order_number ?? null,
    handler: row.handler,
    takenOverAt: iso(row.taken_over_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function supportById(id, executor = pool) {
  const [[row]] = await executor.query(`${SUPPORT_SELECT} WHERE s.id = ?`, [id]);
  return row ?? null;
}

/**
 * A list of requests with the counts the inbox tabs need.
 *   filters: status, sellerId (requests about that seller's orders), handler ('seller'|'tsm'), userId, q, sort ('newest'|'oldest')
 *   forSeller: the seller portal is asking, so q only searches what a seller may see (not the buyer's name or email)
 * The open ones always come first, then by last activity.
 */
export async function loadSupport({ status = 'all', sellerId, handler, userId, q, sort = 'newest', limit = 50, offset = 0, forSeller = false }, executor = pool) {
  const where = [];
  const params = [];
  if (status !== 'all') { where.push('s.status = ?'); params.push(status); }
  if (sellerId) { where.push('s.seller_id = ?'); params.push(sellerId); }
  if (handler === 'seller') where.push("s.seller_id IS NOT NULL AND s.handler = 'seller'");
  if (handler === 'tsm') where.push("(s.seller_id IS NULL OR s.handler = 'tsm')");
  if (userId) { where.push('s.user_id = ?'); params.push(userId); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    if (forSeller) {
      // A seller may only search what they are allowed to see: never the buyer's name or email, or a hit would give them away.
      where.push("(s.ref LIKE ? OR s.subject LIKE ? OR o.order_number LIKE ? OR (u.status <> 'deleted' AND u.username LIKE ?))");
      params.push(like, like, like, like);
    } else {
      where.push('(s.ref LIKE ? OR s.subject LIKE ? OR s.email LIKE ? OR s.name LIKE ? OR o.order_number LIKE ? OR sp.display_name LIKE ?)');
      params.push(like, like, like, like, like, like);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await executor.query(`SELECT COUNT(*) AS total ${SUPPORT_FROM} ${whereSql}`, params);
  const [rows] = await executor.query(
    `${SUPPORT_SELECT} ${whereSql} ORDER BY (s.status = 'open') DESC, s.updated_at ${dir(sort)}, s.id ${dir(sort)} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { rows, total: Number(total) };
}

/** { open, answered, closed } for the same slice (a seller, or everything). */
export async function supportCounts({ sellerId } = {}, executor = pool) {
  const [counts] = await executor.query(
    `SELECT status, COUNT(*) AS n FROM support_requests ${sellerId ? 'WHERE seller_id = ?' : ''} GROUP BY status`,
    sellerId ? [sellerId] : [],
  );
  const byStatus = { open: 0, answered: 0, closed: 0 };
  for (const c of counts) byStatus[c.status] = Number(c.n);
  return byStatus;
}
