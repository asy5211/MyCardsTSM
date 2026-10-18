// Staff: the two inboxes where people write to TSM - sell-to-us tickets (with price offers) and support requests.
//
//   GET  /api/staff/tickets                       ?status=all|submitted|in_review|offer_sent|countered|accepted|declined|completed, q, sort=newest|oldest, limit, offset
//   GET  /api/staff/tickets/:id                   the ticket, the seller, and the whole negotiation
//   POST /api/staff/tickets/:id/start-review      submitted -> in review
//   POST /api/staff/tickets/:id/offer             {amountCents, message?}  send (or replace) a price offer (a counter offer)
//   POST /api/staff/tickets/:id/accept-ask        take the seller's asking price as it stands (while the ticket is waiting or in review)
//   POST /api/staff/tickets/:id/accept-counter    take the seller's counter offer
//   POST /api/staff/tickets/:id/decline           {note?}
//   POST /api/staff/tickets/:id/complete          after the payment was made outside the app
//   POST /api/staff/tickets/:id/messages          {body}
//   POST /api/staff/tickets/:id/items/:itemId     {removed: true|false}  drop an item from the deal (or put it back)
//
//   GET  /api/staff/support                       ?status=all|open|answered|closed, sellerId, handler=all|seller|tsm, q, sort=newest|oldest, limit, offset
//   GET  /api/staff/support/:id                   the request and its conversation
//   POST /api/staff/support/:id/messages          {body}   (marks it answered)
//   POST /api/staff/support/:id/status            {status: open|closed}
//   POST /api/staff/support/:id/take-over         TSM takes a seller's request over (the seller can no longer reply)
//   POST /api/staff/support/:id/hand-back         give it back to the seller
//
// Everyone on staff can read and answer support, including requests that were sent to a seller. Sending price offers and closing deals needs "admin" or "super_admin".
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { MESSAGE_MAX, addMessage, listMessages, messageDto } from '../lib/conversations.js';
import { sortParam } from '../lib/sort.js';
import { loadSupport, supportById, supportCounts, supportDto } from '../lib/support.js';
import { assertCan, isFinal, loadTickets, money } from '../lib/tickets.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();
const read = requireStaff();
const write = requireStaff('super_admin', 'admin');
const actor = (req) => ({ actorType: 'staff', actorId: req.staff.id, ip: req.ip });
const page = { limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) };
const messageBody = z.object({ body: z.string({ error: 'Write a message' }).trim().min(1, 'Write a message').max(MESSAGE_MAX, 'That message is too long') });
const MAX_OFFER_CENTS = 100_000_000;

// ---- Sell-to-us tickets -------------------------------------------------------------------------------

const TICKET_STATUSES = ['submitted', 'in_review', 'offer_sent', 'countered', 'accepted', 'declined', 'completed'];

async function ticketById(id) {
  if (!UUID_RE.test(id)) throw notFound('Ticket not found');
  const { items } = await loadTickets({ ids: [id] });
  if (!items.length) throw notFound('Ticket not found');
  return items[0];
}
const fullTicket = async (id) => {
  const ticket = await ticketById(id);
  return { ...ticket, messages: await listMessages('sell_ticket', id, ['staff']) };
};

router.get('/tickets', read, async (req, res) => {
  const f = parse(z.object({ status: z.enum(['all', ...TICKET_STATUSES]).default('all'), q: z.string().trim().min(1).max(100).optional(), sort: sortParam(), ...page }), req.query);
  const { items, total } = await loadTickets({ status: f.status, q: f.q, sort: f.sort, limit: f.limit, offset: f.offset });
  const [counts] = await pool.query('SELECT status, COUNT(*) AS n FROM sell_tickets GROUP BY status');
  const byStatus = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
  for (const c of counts) byStatus[c.status] = Number(c.n);
  res.json({ items, total, counts: byStatus, limit: f.limit, offset: f.offset });
});

router.get('/tickets/:id', read, async (req, res) => {
  res.json(await fullTicket(req.params.id));
});

/** One status change by staff, with its line in the conversation, under a row lock. */
async function staffTransition(req, action, { fields = {}, message, auditAction, closes = false }) {
  const ticket = await ticketById(req.params.id);
  await withTransaction(async (conn) => {
    const [[locked]] = await conn.query('SELECT status FROM sell_tickets WHERE id = ? FOR UPDATE', [ticket.id]);
    const next = assertCan({ status: locked.status }, action);
    const sets = ['status = ?'];
    const values = [next];
    for (const [column, value] of Object.entries(fields)) { sets.push(`${column} = ?`); values.push(value); }
    if (closes || next === 'declined' || next === 'completed') sets.push('closed_at = NOW(3)');
    await conn.query(`UPDATE sell_tickets SET ${sets.join(', ')} WHERE id = ?`, [...values, ticket.id]);
    if (message) {
      await addMessage({ kind: 'sell_ticket', threadId: ticket.id, senderType: 'staff', senderId: req.staff.id, senderName: req.staff.name, ...message }, conn);
    }
    await audit({ ...actor(req), action: auditAction, entityType: 'sell_ticket', entityId: ticket.id, details: { ticketNumber: ticket.ticketNumber, from: locked.status, to: next } }, conn);
  });
  return fullTicket(ticket.id);
}

router.post('/tickets/:id/start-review', write, async (req, res) => {
  res.json(await staffTransition(req, 'staffReview', {
    message: { msgKind: 'status', body: 'We are reviewing your items now.' },
    auditAction: 'sell_ticket.review_started',
  }));
});

router.post('/tickets/:id/offer', write, async (req, res) => {
  const body = parse(
    z.object({
      amountCents: z.number({ error: 'Enter the offer' }).int('Enter the offer').min(1, 'Enter the offer').max(MAX_OFFER_CENTS, 'That offer is too high'),
      message: z.string().trim().max(MESSAGE_MAX).nullish().transform((v) => v || null),
    }),
    req.body,
  );
  res.json(await staffTransition(req, 'staffOffer', {
    fields: { offer_cents: body.amountCents, offer_by: 'staff', decision_note: null },
    message: { msgKind: 'offer', amountCents: body.amountCents, body: `We can offer ${money(body.amountCents)} for the items on this ticket${body.message ? `. ${body.message}` : '.'}` },
    auditAction: 'sell_ticket.offer_sent',
  }));
});

router.post('/tickets/:id/accept-ask', write, async (req, res) => {
  const ticket = await ticketById(req.params.id);
  assertCan(ticket, 'staffAcceptAsk');
  if (ticket.askingTotalCents <= 0) {
    throw conflict('The seller did not name a price for these items. Send an offer instead.');
  }
  res.json(await staffTransition(req, 'staffAcceptAsk', {
    fields: { offer_cents: ticket.askingTotalCents, offer_by: 'staff', decision_note: null },
    message: { msgKind: 'accept', amountCents: ticket.askingTotalCents, body: `We accept your asking price of ${money(ticket.askingTotalCents)}.` },
    auditAction: 'sell_ticket.ask_accepted',
  }));
});

router.post('/tickets/:id/accept-counter', write, async (req, res) => {
  const ticket = await ticketById(req.params.id);
  res.json(await staffTransition(req, 'staffAcceptCounter', {
    message: { msgKind: 'accept', amountCents: ticket.offerCents, body: `We accept your price of ${money(ticket.offerCents)}.` },
    auditAction: 'sell_ticket.counter_accepted',
  }));
});

router.post('/tickets/:id/decline', write, async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().max(500).nullish().transform((v) => v || null) }), req.body);
  res.json(await staffTransition(req, 'staffDecline', {
    fields: { decision_note: body.note },
    message: { msgKind: 'decline', body: body.note ? `We are not able to move forward: ${body.note}` : 'We are not able to move forward with this ticket.' },
    auditAction: 'sell_ticket.declined_by_staff',
  }));
});

router.post('/tickets/:id/complete', write, async (req, res) => {
  const ticket = await ticketById(req.params.id);
  res.json(await staffTransition(req, 'staffComplete', {
    message: { msgKind: 'status', body: `Payment of ${money(ticket.offerCents ?? 0)} was sent outside the app. This ticket is complete.` },
    auditAction: 'sell_ticket.completed',
  }));
});

router.post('/tickets/:id/messages', write, async (req, res) => {
  const ticket = await ticketById(req.params.id);
  const { body } = parse(messageBody, req.body);
  if (isFinal(ticket.status)) throw conflict(`This ticket is ${ticket.statusLabel.toLowerCase()}.`);
  const row = await addMessage({ kind: 'sell_ticket', threadId: ticket.id, senderType: 'staff', senderId: req.staff.id, senderName: req.staff.name, body });
  await pool.query('UPDATE sell_tickets SET updated_at = NOW(3) WHERE id = ?', [ticket.id]);
  res.status(201).json(messageDto(row, ['staff']));
});

router.post('/tickets/:id/items/:itemId', write, async (req, res) => {
  const ticket = await ticketById(req.params.id);
  if (!UUID_RE.test(req.params.itemId)) throw notFound('Item not found');
  const { removed } = parse(z.object({ removed: z.boolean({ error: 'Say whether to remove it' }) }), req.body);
  if (isFinal(ticket.status) || ticket.status === 'accepted') throw conflict(`Items cannot be changed while the ticket is "${ticket.statusLabel}"`);
  const [result] = await pool.query('UPDATE sell_ticket_items SET removed_by_admin = ? WHERE id = ? AND ticket_id = ?', [removed ? 1 : 0, req.params.itemId, ticket.id]);
  if (!result.affectedRows) throw notFound('Item not found');
  const item = ticket.items.find((i) => i.id === req.params.itemId);
  await addMessage({
    kind: 'sell_ticket', threadId: ticket.id, senderType: 'staff', senderId: req.staff.id, senderName: req.staff.name, msgKind: 'status',
    body: removed ? `Removed "${item?.productName}" from the deal.` : `Put "${item?.productName}" back in the deal.`,
  });
  await audit({ ...actor(req), action: removed ? 'sell_ticket.item_removed' : 'sell_ticket.item_restored', entityType: 'sell_ticket', entityId: ticket.id, details: { ticketNumber: ticket.ticketNumber, item: item?.productName } });
  res.json(await fullTicket(ticket.id));
});

// ---- Support requests ------------------------------------------------------------------------------------

async function supportOrFail(id) {
  if (!UUID_RE.test(id)) throw notFound('Request not found');
  const row = await supportById(id);
  if (!row) throw notFound('Request not found');
  return row;
}

router.get('/support', read, async (req, res) => {
  const f = parse(
    z.object({
      status: z.enum(['all', 'open', 'answered', 'closed']).default('all'),
      sellerId: z.string().regex(UUID_RE).optional(),
      handler: z.enum(['all', 'seller', 'tsm']).default('all'),
      q: z.string().trim().min(1).max(100).optional(),
      sort: sortParam(),
      ...page,
    }),
    req.query,
  );
  const { rows, total } = await loadSupport({ status: f.status, sellerId: f.sellerId, handler: f.handler, q: f.q, sort: f.sort, limit: f.limit, offset: f.offset });
  // The tab counts follow the seller filter, so "Open (3)" always means open requests for the seller you are looking at.
  res.json({ items: rows.map(supportDto), total, counts: await supportCounts({ sellerId: f.sellerId }), limit: f.limit, offset: f.offset });
});

router.get('/support/:id', read, async (req, res) => {
  const row = await supportOrFail(req.params.id);
  res.json({ request: supportDto(row), messages: await listMessages('support', row.id, ['staff']) });
});

router.post('/support/:id/messages', read, async (req, res) => {
  const row = await supportOrFail(req.params.id);
  const { body } = parse(messageBody, req.body);
  const message = await addMessage({ kind: 'support', threadId: row.id, senderType: 'staff', senderId: req.staff.id, senderName: req.staff.name, body });
  await pool.query("UPDATE support_requests SET status = 'answered' WHERE id = ?", [row.id]);
  await audit({ ...actor(req), action: 'support.answered', entityType: 'support_request', entityId: row.id, details: { ref: row.ref, guest: row.user_id === null, handler: row.seller_id ? row.handler : 'tsm' } });
  res.status(201).json(messageDto(message, ['staff']));
});

router.post('/support/:id/status', read, async (req, res) => {
  const row = await supportOrFail(req.params.id);
  const { status } = parse(z.object({ status: z.enum(['open', 'closed'], { error: 'Choose open or closed' }) }), req.body);
  await pool.query('UPDATE support_requests SET status = ? WHERE id = ?', [status, row.id]);
  await audit({ ...actor(req), action: status === 'closed' ? 'support.closed' : 'support.reopened', entityType: 'support_request', entityId: row.id, details: { ref: row.ref } });
  res.json({ request: supportDto(await supportOrFail(row.id)) });
});

// Staff always have access to a request sent to a seller. When the seller does a poor job, TSM takes over: the seller can
// read the request but not reply any more. Handing it back restores the seller's reply box.
router.post('/support/:id/take-over', read, async (req, res) => {
  const row = await supportOrFail(req.params.id);
  if (!row.seller_id) throw conflict('This request was never sent to a seller, so TSM already has it.');
  if (row.handler === 'tsm') throw conflict('TSM has already taken this request over.');
  await withTransaction(async (conn) => {
    await conn.query("UPDATE support_requests SET handler = 'tsm', taken_over_at = NOW(3), taken_over_by_staff_id = ?, status = IF(status = 'closed', status, 'open') WHERE id = ?", [req.staff.id, row.id]);
    await addMessage({ kind: 'support', threadId: row.id, senderType: 'system', senderName: 'TSM', msgKind: 'status', body: 'TSM support has taken over this request and will reply from here.' }, conn);
    await audit({ ...actor(req), action: 'support.taken_over', entityType: 'support_request', entityId: row.id, details: { ref: row.ref, sellerId: row.seller_id, seller: row.seller_name } }, conn);
  });
  res.json({ request: supportDto(await supportOrFail(row.id)), messages: await listMessages('support', row.id, ['staff']) });
});

router.post('/support/:id/hand-back', read, async (req, res) => {
  const row = await supportOrFail(req.params.id);
  if (!row.seller_id) throw conflict('This request was never sent to a seller.');
  if (row.handler === 'seller') throw conflict('This request is already with the seller.');
  await withTransaction(async (conn) => {
    await conn.query("UPDATE support_requests SET handler = 'seller', taken_over_at = NULL, taken_over_by_staff_id = NULL WHERE id = ?", [row.id]);
    await addMessage({ kind: 'support', threadId: row.id, senderType: 'system', senderName: 'TSM', msgKind: 'status', body: `TSM handed this request back to ${row.seller_name ?? 'the seller'}.` }, conn);
    await audit({ ...actor(req), action: 'support.handed_back', entityType: 'support_request', entityId: row.id, details: { ref: row.ref, sellerId: row.seller_id, seller: row.seller_name } }, conn);
  });
  res.json({ request: supportDto(await supportOrFail(row.id)), messages: await listMessages('support', row.id, ['staff']) });
});

export default router;
