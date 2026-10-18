// Contact support. Works for signed-in people AND guests (someone who forgot their password, say).
//
//   POST /api/support                      {name?, email?, topic, subject, message}   name + email are required when not signed in
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
import { parse, UUID_RE } from '../lib/validate.js';
import { optionalUser, requireUser } from '../middleware/auth.js';

const router = Router();
const iso = (d) => (d ? new Date(d).toISOString() : null);

export const TOPICS = ['account', 'order', 'selling', 'payment', 'other'];

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
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const createBody = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80, 'That name is too long').optional(),
  email: z.string().trim().toLowerCase().max(255).email('Enter a valid email address').optional(),
  topic: z.enum(TOPICS, { error: 'Choose a topic' }).default('other'),
  subject: z.string({ error: 'Add a short subject' }).trim().min(3, 'Add a short subject').max(120, 'Keep the subject under 120 characters'),
  message: z.string({ error: 'Tell us what you need' }).trim().min(10, 'Tell us a little more (at least 10 characters)').max(MESSAGE_MAX, 'That message is too long'),
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
  const id = randomUUID();
  await withTransaction(async (conn) => {
    const ref = await withUniqueRef(newSupportRef, async (supportRef) => {
      await conn.query(
        'INSERT INTO support_requests (id, ref, user_id, name, email, topic, subject, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, supportRef, req.user?.id ?? null, name, email, body.topic, body.subject, 'open'],
      );
      return supportRef;
    });
    await addMessage({ kind: 'support', threadId: id, senderType: 'user', senderId: req.user?.id ?? null, senderName: name, body: body.message }, conn);
    await audit(
      { actorType: req.user ? 'user' : 'system', actorId: req.user?.id ?? null, ip: req.ip, action: 'support.requested', entityType: 'support_request', entityId: id, details: { ref, topic: body.topic, guest: !req.user } },
      conn,
    );
  });
  const [[row]] = await pool.query('SELECT * FROM support_requests WHERE id = ?', [id]);
  res.status(201).json({ request: supportDto(row) });
});

router.get('/', requireUser, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM support_requests WHERE user_id = ? ORDER BY updated_at DESC, id LIMIT 50', [req.user.id]);
  res.json({ items: rows.map(supportDto) });
});

async function mine(req) {
  if (!UUID_RE.test(req.params.id)) throw notFound('Request not found');
  const [[row]] = await pool.query('SELECT * FROM support_requests WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) throw notFound('Request not found');
  return row;
}

router.get('/:id', requireUser, async (req, res) => {
  const row = await mine(req);
  res.json({ request: supportDto(row), messages: await listMessages('support', row.id, ['user']) });
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
