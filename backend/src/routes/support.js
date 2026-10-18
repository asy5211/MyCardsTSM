// Contact support. Works for signed-in people AND guests (someone who forgot their password, say).
//
//   POST /api/support                      {name?, email?, topic, subject, message, orderId?}   name + email are required when not signed in.
//                                          With orderId (one of my orders) the request goes to that order's seller; TSM can always see it
//   GET  /api/support                      (signed in) my requests
//   GET  /api/support/:id                  (signed in) one request with the conversation
//   POST /api/support/:id/messages         (signed in) {body}  add to the conversation (reopens it if it was answered)
//
// A guest has no account to come back to, so staff answer a guest by email. Guest sending is rate limited.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { MESSAGE_MAX, addMessage, countMessages, listMessages, messageDto } from '../lib/conversations.js';
import { newSupportRef, withUniqueRef } from '../lib/refs.js';
import { SUPPORT_SELECT, SUPPORT_TOPICS, supportById, supportDto } from '../lib/support.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { optionalUser, requireUser } from '../middleware/auth.js';

const router = Router();
export const TOPICS = SUPPORT_TOPICS;
export { supportDto };

/** What the buyer sees: the same request, without which staff member took it over (that is for the team). */
function buyerDto(row) {
  const { takenOverBy, ...rest } = supportDto(row);
  return rest;
}

const createBody = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80, 'That name is too long').optional(),
  email: z.string().trim().toLowerCase().max(255).email('Enter a valid email address').optional(),
  topic: z.enum(TOPICS, { error: 'Choose a topic' }).default('other'),
  subject: z.string({ error: 'Add a short subject' }).trim().min(3, 'Add a short subject').max(120, 'Keep the subject under 120 characters'),
  message: z.string({ error: 'Tell us what you need' }).trim().min(10, 'Tell us a little more (at least 10 characters)').max(MESSAGE_MAX, 'That message is too long'),
  orderId: z.string().regex(UUID_RE, 'That is not a valid order').optional(),
});

router.post('/', optionalUser, async (req, res) => {
  const body = parse(createBody, req.body);
  // A signed-in person is identified by their account. A guest must say who they are, so staff can answer by email.
  const name = req.user ? req.user.username : body.name;
  const email = req.user ? req.user.email : body.email;
  if (!name || !email) {
    throw new HttpError(400, 'validation_error', 'Some fields are invalid', [
      ...(!name ? [{ field: 'name', message: 'Enter your name' }] : []),
      ...(!email ? [{ field: 'email', message: 'Enter the email we should reply to' }] : []),
    ]);
  }

  // A request about one of my orders goes to that order's seller (TSM's own store answers for itself, so those stay with TSM).
  let order = null;
  if (body.orderId) {
    if (!req.user) throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'orderId', message: 'Sign in to ask about an order' }]);
    const [[found]] = await pool.query(
      'SELECT o.id, o.order_number, o.seller_id, sp.is_house FROM orders o JOIN seller_profiles sp ON sp.user_id = o.seller_id WHERE o.id = ? AND o.buyer_id = ?',
      [body.orderId, req.user.id],
    );
    if (!found) throw notFound('Order not found');
    order = found;
  }
  const topic = order ? 'order' : body.topic;
  const handler = order && !order.is_house ? 'seller' : 'tsm';

  const id = randomUUID();
  await withTransaction(async (conn) => {
    const ref = await withUniqueRef(newSupportRef, async (supportRef) => {
      await conn.query(
        'INSERT INTO support_requests (id, ref, user_id, name, email, topic, subject, status, seller_id, order_id, handler) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, supportRef, req.user?.id ?? null, name, email, topic, body.subject, 'open', order?.seller_id ?? null, order?.id ?? null, handler],
      );
      return supportRef;
    });
    await addMessage({ kind: 'support', threadId: id, senderType: 'user', senderId: req.user?.id ?? null, senderName: name, body: body.message }, conn);
    await audit(
      { actorType: req.user ? 'user' : 'system', actorId: req.user?.id ?? null, ip: req.ip, action: 'support.requested', entityType: 'support_request', entityId: id, details: { ref, topic, guest: !req.user, orderNumber: order?.order_number ?? null, handler } },
      conn,
    );
  });
  res.status(201).json({ request: buyerDto(await supportById(id)) });
});

router.get('/', requireUser, async (req, res) => {
  const [rows] = await pool.query(`${SUPPORT_SELECT} WHERE s.user_id = ? ORDER BY s.updated_at DESC, s.id LIMIT 50`, [req.user.id]);
  res.json({ items: rows.map(buyerDto) });
});

async function mine(req) {
  if (!UUID_RE.test(req.params.id)) throw notFound('Request not found');
  const row = await supportById(req.params.id);
  if (!row || row.user_id !== req.user.id) throw notFound('Request not found');
  return row;
}

router.get('/:id', requireUser, async (req, res) => {
  const row = await mine(req);
  res.json({ request: buyerDto(row), messages: await listMessages('support', row.id, ['user']) });
});

router.post('/:id/messages', requireUser, async (req, res) => {
  const row = await mine(req);
  const { body } = parse(z.object({ body: z.string({ error: 'Write a message' }).trim().min(1, 'Write a message').max(MESSAGE_MAX, 'That message is too long') }), req.body);
  if (row.status === 'closed') throw conflict('This request is closed. Please send a new message to support.');
  if ((await countMessages('support', row.id)) >= 500) throw conflict('This conversation is full. Please send a new message to support.');
  const message = await addMessage({ kind: 'support', threadId: row.id, senderType: 'user', senderId: req.user.id, senderName: req.user.username, body });
  await pool.query("UPDATE support_requests SET status = 'open' WHERE id = ?", [row.id]);
  res.status(201).json(messageDto(message, ['user']));
});

export default router;
