// A buyer's side of orders. Everything needs a signed-in person and only ever shows THEIR orders.
//
//   POST /api/orders                              {items: [{listingId, quantity}]}  buys the items with the saved shipping address.
//                                                 One order is made per seller; a case offer hands out the next box number(s).
//   GET  /api/orders                              ?limit, offset   my orders, newest first
//   GET  /api/orders/:id                          one order with tracking and each item's review
//   POST /api/orders/:id/delivered                I received it (only after the seller shipped it)
//   GET  /api/orders/:id/messages                 the chat with the seller
//   POST /api/orders/:id/messages                 {body}
//   POST /api/orders/:id/items/:itemId/review     {rating: 1-5, comment?}  any time after you bought it (not on a cancelled order)
//
// Payment is not collected here yet: the order is recorded as placed, and the money split (TSM fee, payment fee,
// what the seller receives) is written to the seller's ledger at the rates set in the admin Settings.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { MESSAGE_MAX, addMessage, countMessages, listMessages, messageDto } from '../lib/conversations.js';
import { MAX_LINES, MAX_QUANTITY_PER_LINE, countOrders, loadOrderFor, loadOrders, placeOrders } from '../lib/orders.js';
import { REVIEW_SELECT, recomputeSellerRating, reviewDto } from '../lib/reviews.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser);

const page = { limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) };
const messageBody = z.object({ body: z.string({ error: 'Write a message' }).trim().min(1, 'Write a message').max(MESSAGE_MAX, 'That message is too long') });

function idParam(value) {
  if (!UUID_RE.test(value)) throw notFound('Order not found');
  return value;
}

router.post('/', async (req, res) => {
  const body = parse(
    z.object({
      items: z
        .array(
          z.object({
            listingId: z.string({ error: 'Choose an item' }).regex(UUID_RE, 'Choose an item'),
            quantity: z.number({ error: 'Choose how many' }).int('Choose how many').min(1, 'Choose how many').max(MAX_QUANTITY_PER_LINE),
          }),
        )
        .min(1, 'Your cart is empty')
        .max(MAX_LINES, `You can check out at most ${MAX_LINES} items at once`),
    }),
    req.body,
  );
  const orders = await placeOrders({ buyer: req.user, lines: body.items, ip: req.ip });
  res.status(201).json({ orders });
});

router.get('/', async (req, res) => {
  const f = parse(z.object(page), req.query);
  const filters = { buyerId: req.user.id };
  res.json({
    items: await loadOrders({ ...filters, limit: f.limit, offset: f.offset, view: 'buyer' }),
    total: await countOrders(filters),
    limit: f.limit,
    offset: f.offset,
  });
});

router.get('/:id', async (req, res) => {
  res.json(await loadOrderFor(idParam(req.params.id), { buyerId: req.user.id }, 'buyer'));
});

router.post('/:id/delivered', async (req, res) => {
  const order = await loadOrderFor(idParam(req.params.id), { buyerId: req.user.id }, 'buyer');
  if (order.status === 'delivered') return res.json(order);
  if (order.status !== 'shipped') throw conflict('You can mark an order as received after the seller ships it');
  await pool.query("UPDATE orders SET status = 'delivered', delivered_at = NOW(3) WHERE id = ? AND status = 'shipped'", [order.id]);
  await audit({ actorType: 'user', actorId: req.user.id, ip: req.ip, action: 'order.delivered', entityType: 'order', entityId: order.id, details: { orderNumber: order.orderNumber } });
  res.json(await loadOrderFor(order.id, { buyerId: req.user.id }, 'buyer'));
});

// ---- Chat with the seller ----------------------------------------------------------------

router.get('/:id/messages', async (req, res) => {
  const order = await loadOrderFor(idParam(req.params.id), { buyerId: req.user.id }, 'buyer');
  res.json({ items: await listMessages('order', order.id, ['user']) });
});

router.post('/:id/messages', async (req, res) => {
  const order = await loadOrderFor(idParam(req.params.id), { buyerId: req.user.id }, 'buyer');
  const { body } = parse(messageBody, req.body);
  if ((await countMessages('order', order.id)) >= 500) throw conflict('This conversation is full. Contact TSM support if you still need help.');
  const row = await addMessage({ kind: 'order', threadId: order.id, senderType: 'user', senderId: req.user.id, senderName: req.user.username, body });
  res.status(201).json(messageDto(row, ['user']));
});

// ---- Reviews ----------------------------------------------------------------------------------

router.post('/:id/items/:itemId/review', async (req, res) => {
  const order = await loadOrderFor(idParam(req.params.id), { buyerId: req.user.id }, 'buyer');
  if (!UUID_RE.test(req.params.itemId)) throw notFound('Item not found');
  const item = order.items.find((i) => i.id === req.params.itemId);
  if (!item) throw notFound('Item not found');
  const body = parse(
    z.object({
      rating: z.number({ error: 'Choose 1 to 5 stars' }).int('Choose 1 to 5 stars').min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars'),
      comment: z.string().trim().max(1000, 'Keep your review under 1000 characters').nullish().transform((v) => v || null),
    }),
    req.body,
  );
  // Reviewing is open as soon as the purchase is made; only an order that was cancelled has nothing to review.
  if (order.status === 'cancelled') throw conflict('This order was cancelled, so there is nothing to review');
  if (item.review) throw conflict('You already reviewed this item');

  const reviewId = randomUUID();
  try {
    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO reviews (id, order_item_id, order_id, buyer_id, seller_id, product_id, rating, comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [reviewId, item.id, order.id, req.user.id, order.seller.id, item.productId, body.rating, body.comment],
      );
      await recomputeSellerRating(order.seller.id, conn);
      await audit(
        { actorType: 'user', actorId: req.user.id, ip: req.ip, action: 'review.created', entityType: 'review', entityId: reviewId, details: { orderNumber: order.orderNumber, rating: body.rating } },
        conn,
      );
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('You already reviewed this item');
    throw err;
  }
  const [[row]] = await pool.query(`${REVIEW_SELECT} WHERE r.id = ?`, [reviewId]);
  res.status(201).json(reviewDto(row));
});

export default router;
