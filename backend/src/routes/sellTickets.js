// The seller's side of "Sell to us". Only an approved seller in good standing can use it.
//
//   GET  /api/sell-tickets                    my tickets, newest activity first
//   POST /api/sell-tickets                    {items: [{productName, quantity, source?, minPricePerItemCents?}]}
//   GET  /api/sell-tickets/:id                one ticket with the whole negotiation
//   POST /api/sell-tickets/:id/messages       {body}
//   POST /api/sell-tickets/:id/accept         take TSM's current offer
//   POST /api/sell-tickets/:id/counter        {amountCents, message?}  answer with my own price
//   POST /api/sell-tickets/:id/decline        {note?}  walk away (also withdraws a ticket still being reviewed)
//
// Payments for accepted offers happen outside the app; staff mark the ticket completed afterwards.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { MESSAGE_MAX, addMessage, countMessages, listMessages, messageDto } from '../lib/conversations.js';
import { newTicketNumber, withUniqueRef } from '../lib/refs.js';
import { assertCan, isFinal, loadTickets, money } from '../lib/tickets.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireSeller, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser, requireSeller);

const MAX_OFFER_CENTS = 100_000_000; // $1,000,000.00
const messageBody = z.object({ body: z.string({ error: 'Write a message' }).trim().min(1, 'Write a message').max(MESSAGE_MAX, 'That message is too long') });
const createBody = z.object({
  items: z
    .array(
      z.object({
        productName: z.string({ error: 'Enter the product name' }).trim().min(2, 'Enter the product name').max(160, 'Keep the name under 160 characters'),
        quantity: z.number({ error: 'Enter how many' }).int('Enter a whole number').min(1, 'Enter how many').max(100_000, 'That is too many'),
        source: z.string().trim().max(120, 'Keep the source under 120 characters').default(''),
        minPricePerItemCents: z.number().int('Enter the price in whole cents').min(0).max(10_000_000, 'That price is too high').default(0),
      }),
    )
    .min(1, 'Add at least one item')
    .max(25, 'A ticket can hold at most 25 items'),
});

async function mine(req) {
  if (!UUID_RE.test(req.params.id)) throw notFound('Ticket not found');
  const { items } = await loadTickets({ ids: [req.params.id], userId: req.user.id });
  if (!items.length) throw notFound('Ticket not found');
  return items[0];
}

const full = async (req, ticket) => ({ ...ticket, messages: await listMessages('sell_ticket', ticket.id, ['user']) });

router.get('/', async (req, res) => {
  const { items, total } = await loadTickets({ userId: req.user.id, limit: 100 });
  res.json({ items, total });
});

router.post('/', async (req, res) => {
  const body = parse(createBody, req.body);
  const ticketId = randomUUID();
  await withTransaction(async (conn) => {
    const number = await withUniqueRef(newTicketNumber, async (ticketNumber) => {
      await conn.query("INSERT INTO sell_tickets (id, ticket_number, user_id, status) VALUES (?, ?, ?, 'submitted')", [ticketId, ticketNumber, req.user.id]);
      return ticketNumber;
    });
    for (const [index, item] of body.items.entries()) {
      await conn.query(
        'INSERT INTO sell_ticket_items (id, ticket_id, product_name, quantity, source, min_price_cents, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), ticketId, item.productName, item.quantity, item.source, item.minPricePerItemCents, index],
      );
    }
    await addMessage({ kind: 'sell_ticket', threadId: ticketId, senderType: 'system', senderName: 'TSM', msgKind: 'status', body: 'Ticket submitted. A TSM team member will review it and reply here.' }, conn);
    await audit({ actorType: 'user', actorId: req.user.id, ip: req.ip, action: 'sell_ticket.submitted', entityType: 'sell_ticket', entityId: ticketId, details: { ticketNumber: number, items: body.items.length } }, conn);
  });
  const { items } = await loadTickets({ ids: [ticketId] });
  res.status(201).json(await full(req, items[0]));
});

router.get('/:id', async (req, res) => {
  res.json(await full(req, await mine(req)));
});

router.post('/:id/messages', async (req, res) => {
  const ticket = await mine(req);
  const { body } = parse(messageBody, req.body);
  if (isFinal(ticket.status)) throw conflict(`This ticket is ${ticket.statusLabel.toLowerCase()}. Start a new ticket if you have more to sell.`);
  if ((await countMessages('sell_ticket', ticket.id)) >= 500) throw conflict('This conversation is full. Contact TSM support if you still need help.');
  const row = await addMessage({ kind: 'sell_ticket', threadId: ticket.id, senderType: 'user', senderId: req.user.id, senderName: req.seller.display_name, body });
  await pool.query('UPDATE sell_tickets SET updated_at = NOW(3) WHERE id = ?', [ticket.id]);
  res.status(201).json(messageDto(row, ['user']));
});

/** Moves the ticket to its next status and writes the matching line in the conversation, all in one transaction. */
async function transition(req, ticket, action, { fields = {}, message, auditAction }) {
  await withTransaction(async (conn) => {
    // Re-read under a lock, so two people acting at once cannot both succeed.
    const [[locked]] = await conn.query('SELECT status FROM sell_tickets WHERE id = ? FOR UPDATE', [ticket.id]);
    const next = assertCan({ status: locked.status }, action);
    const sets = ['status = ?'];
    const values = [next];
    for (const [column, value] of Object.entries(fields)) { sets.push(`${column} = ?`); values.push(value); }
    if (next === 'declined') sets.push('closed_at = NOW(3)');
    await conn.query(`UPDATE sell_tickets SET ${sets.join(', ')} WHERE id = ?`, [...values, ticket.id]);
    await addMessage({ kind: 'sell_ticket', threadId: ticket.id, senderType: 'user', senderId: req.user.id, senderName: req.seller.display_name, ...message }, conn);
    await audit({ actorType: 'user', actorId: req.user.id, ip: req.ip, action: auditAction, entityType: 'sell_ticket', entityId: ticket.id, details: { ticketNumber: ticket.ticketNumber } }, conn);
  });
  return full(req, await mine(req));
}

router.post('/:id/accept', async (req, res) => {
  const ticket = await mine(req);
  assertCan(ticket, 'userAccept');
  res.json(await transition(req, ticket, 'userAccept', {
    message: { msgKind: 'accept', amountCents: ticket.offerCents, body: `Accepted the offer of ${money(ticket.offerCents)}` },
    auditAction: 'sell_ticket.accepted',
  }));
});

router.post('/:id/counter', async (req, res) => {
  const ticket = await mine(req);
  const body = parse(
    z.object({
      amountCents: z.number({ error: 'Enter your price' }).int('Enter your price').min(1, 'Enter your price').max(MAX_OFFER_CENTS, 'That price is too high'),
      message: z.string().trim().max(MESSAGE_MAX).nullish().transform((v) => v || null),
    }),
    req.body,
  );
  assertCan(ticket, 'userCounter');
  res.json(await transition(req, ticket, 'userCounter', {
    fields: { offer_cents: body.amountCents, offer_by: 'user' },
    message: { msgKind: 'counter', amountCents: body.amountCents, body: `Countered with ${money(body.amountCents)}${body.message ? `: ${body.message}` : ''}` },
    auditAction: 'sell_ticket.countered',
  }));
});

router.post('/:id/decline', async (req, res) => {
  const ticket = await mine(req);
  const body = parse(z.object({ note: z.string().trim().max(500).nullish().transform((v) => v || null) }), req.body);
  assertCan(ticket, 'userDecline');
  res.json(await transition(req, ticket, 'userDecline', {
    fields: { decision_note: body.note },
    message: { msgKind: 'decline', body: body.note ? `Declined: ${body.note}` : 'Declined' },
    auditAction: 'sell_ticket.declined_by_seller',
  }));
});

export default router;
