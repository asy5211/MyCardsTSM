// Sell-to-us tickets. A seller offers stock to TSM, staff answer with a price, and the seller can
// accept it, decline it, or counter with their own number. Payment happens outside the app: when staff
// have paid, they mark the ticket completed.
//
//   submitted --staff--> in_review --staff--> offer_sent --seller--> accepted --staff--> completed
//                                                  |  ^--staff new offer--  countered <--seller counter
//                                                  +--seller or staff--> declined
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { fromCents } from './money.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

export const STATUS_LABEL = {
  submitted: 'Pending',
  in_review: 'In review',
  offer_sent: 'Offer sent',
  countered: 'Counter offer',
  accepted: 'Accepted',
  declined: 'Declined',
  completed: 'Completed',
};

export const ACTIONS = {
  userAccept: { from: ['offer_sent'], to: 'accepted' },
  userCounter: { from: ['offer_sent'], to: 'countered' },
  userDecline: { from: ['submitted', 'in_review', 'offer_sent', 'countered'], to: 'declined' },
  staffReview: { from: ['submitted'], to: 'in_review' },
  staffOffer: { from: ['submitted', 'in_review', 'offer_sent', 'countered'], to: 'offer_sent' },
  staffAcceptCounter: { from: ['countered'], to: 'accepted' },
  staffDecline: { from: ['submitted', 'in_review', 'offer_sent', 'countered'], to: 'declined' },
  staffComplete: { from: ['accepted'], to: 'completed' },
};

/** Throws a clear 409 when the ticket is not in a state where `action` makes sense. Returns the new status. */
export function assertCan(ticket, action) {
  const rule = ACTIONS[action];
  if (!rule.from.includes(ticket.status)) {
    throw new HttpError(409, 'wrong_status', `That is not possible while the ticket is "${STATUS_LABEL[ticket.status]}"`);
  }
  return rule.to;
}

export const isFinal = (status) => status === 'declined' || status === 'completed';

/** $1,234.50 from 123450 */
export function money(cents) {
  const [whole, frac] = fromCents(cents).split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

export function ticketDto(row, items) {
  const live = items.filter((i) => !i.removed_by_admin);
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status],
    offerCents: row.offer_cents === null ? null : Number(row.offer_cents),
    offerBy: row.offer_by ?? null,
    decisionNote: row.decision_note ?? null,
    askingTotalCents: live.reduce((sum, i) => sum + Number(i.quantity) * Number(i.min_price_cents), 0),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    closedAt: iso(row.closed_at),
    items: items.map((i) => ({
      id: i.id,
      productName: i.product_name,
      quantity: Number(i.quantity),
      source: i.source,
      minPricePerItemCents: Number(i.min_price_cents),
      removedByAdmin: Boolean(i.removed_by_admin),
    })),
  };
}

/** Loads tickets with their items. filters: ids, userId, status, q. For staff, each row also has the seller's name. */
export async function loadTickets({ ids, userId, status, q, limit = 100, offset = 0 }, executor = pool) {
  const where = [];
  const params = [];
  if (ids) { where.push('t.id IN (?)'); params.push(ids.length ? ids : ['']); }
  if (userId) { where.push('t.user_id = ?'); params.push(userId); }
  if (status && status !== 'all') { where.push('t.status = ?'); params.push(status); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push('(t.ticket_number LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR sp.display_name LIKE ? OR EXISTS (SELECT 1 FROM sell_ticket_items x WHERE x.ticket_id = t.id AND x.product_name LIKE ?))');
    params.push(like, like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM sell_tickets t JOIN users u ON u.id = t.user_id LEFT JOIN seller_profiles sp ON sp.user_id = t.user_id ${whereSql}`;
  const [[{ total }]] = await executor.query(`SELECT COUNT(*) AS total ${from}`, params);
  const [rows] = await executor.query(
    `SELECT t.*, u.username, u.email, sp.display_name AS seller_name ${from} ORDER BY t.updated_at DESC, t.id LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  if (!rows.length) return { items: [], total: Number(total) };
  const [items] = await executor.query(
    'SELECT * FROM sell_ticket_items WHERE ticket_id IN (?) ORDER BY sort_order, product_name',
    [rows.map((r) => r.id)],
  );
  return {
    items: rows.map((r) => ({
      ...ticketDto(r, items.filter((i) => i.ticket_id === r.id)),
      seller: { id: r.user_id, username: r.username, email: r.email, displayName: r.seller_name ?? null },
    })),
    total: Number(total),
  };
}
