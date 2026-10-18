// The seller portal's support inbox: help requests that buyers sent about orders THIS seller sold.
//
//   GET  /api/seller/support                 ?status=all|open|answered|closed, q, sort=newest|oldest, limit, offset  + counts
//   GET  /api/seller/support/:id             the request and the conversation
//   POST /api/seller/support/:id/messages    {body}   answer the buyer (marks it answered)
//   POST /api/seller/support/:id/status      {status: open|closed}
//
// TSM staff can read and answer every one of these too. If TSM takes a request over, the seller can still read it
// but cannot reply or change it (handler = "tsm") until TSM hands it back.
// A seller sees the buyer's username only, never their email or name.
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { MESSAGE_MAX, addMessage, countMessages, listMessages, messageDto } from '../lib/conversations.js';
import { sortParam } from '../lib/sort.js';
import { loadSupport, sellerSupportDto, supportById, supportCounts } from '../lib/support.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireSeller, requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser, requireSeller);

const actor = (req) => ({ actorType: 'user', actorId: req.user.id, ip: req.ip });
const page = { limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) };
const messageBody = z.object({ body: z.string({ error: 'Write a message' }).trim().min(1, 'Write a message').max(MESSAGE_MAX, 'That message is too long') });

async function mine(req) {
  if (!UUID_RE.test(req.params.id)) throw notFound('Request not found');
  const row = await supportById(req.params.id);
  if (!row || row.seller_id !== req.user.id) throw notFound('Request not found');
  return row;
}

/** A seller can only act while the request is theirs; once TSM took it over it is read-only for them. */
function assertSellerHandles(row) {
  if (row.handler === 'tsm') throw conflict('TSM support has taken over this request, so you can’t reply to it right now.');
}

router.get('/', async (req, res) => {
  const f = parse(
    z.object({ status: z.enum(['all', 'open', 'answered', 'closed']).default('all'), q: z.string().trim().min(1).max(100).optional(), sort: sortParam(), ...page }),
    req.query,
  );
  const { rows, total } = await loadSupport({ status: f.status, sellerId: req.user.id, q: f.q, sort: f.sort, limit: f.limit, offset: f.offset, forSeller: true });
  res.json({ items: rows.map(sellerSupportDto), total, counts: await supportCounts({ sellerId: req.user.id }), limit: f.limit, offset: f.offset });
});

router.get('/:id', async (req, res) => {
  const row = await mine(req);
  res.json({ request: sellerSupportDto(row), messages: await listMessages('support', row.id, ['seller']) });
});

router.post('/:id/messages', async (req, res) => {
  const row = await mine(req);
  assertSellerHandles(row);
  const { body } = parse(messageBody, req.body);
  if (row.status === 'closed') throw conflict('This request is closed. Reopen it to reply.');
  if ((await countMessages('support', row.id)) >= 500) throw conflict('This conversation is full. Ask the buyer to send a new request.');
  const message = await addMessage({ kind: 'support', threadId: row.id, senderType: 'seller', senderId: req.user.id, senderName: req.seller.display_name, body });
  await pool.query("UPDATE support_requests SET status = 'answered' WHERE id = ?", [row.id]);
  await audit({ ...actor(req), action: 'support.answered_by_seller', entityType: 'support_request', entityId: row.id, details: { ref: row.ref, orderNumber: row.order_number } });
  res.status(201).json(messageDto(message, ['seller']));
});

router.post('/:id/status', async (req, res) => {
  const row = await mine(req);
  assertSellerHandles(row);
  const { status } = parse(z.object({ status: z.enum(['open', 'closed'], { error: 'Choose open or closed' }) }), req.body);
  await pool.query('UPDATE support_requests SET status = ? WHERE id = ?', [status, row.id]);
  await audit({ ...actor(req), action: status === 'closed' ? 'support.closed_by_seller' : 'support.reopened_by_seller', entityType: 'support_request', entityId: row.id, details: { ref: row.ref } });
  res.json({ request: sellerSupportDto(await supportById(row.id)) });
});

export default router;
