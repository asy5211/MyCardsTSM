// Buying: checkout turns "listing + how many" into orders, one order per seller.
//
// The box rule (spec item 1): an offer taken from a case says which box is next ("Box 4 of 12").
// Every unit bought hands the buyer the next box number and moves the offer on, so the next buyer
// gets a new box. Buy 2 at Box 4 and you receive "Boxes 4-5 of 12"; the offer now says "Box 6 of 12".
// When the last box of the case is sold the offer is sold out; the seller edits it to start a new case.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { audit } from './audit.js';
import { addMessage } from './conversations.js';
import { recordSaleEarning } from './earnings.js';
import { mediaPath } from './media.js';
import { toCents } from './money.js';
import { newOrderNumber, withUniqueRef } from './refs.js';
import { getFees } from './settings.js';
import { dir } from './sort.js';

export const MAX_LINES = 20;
export const MAX_QUANTITY_PER_LINE = 99;
const iso = (d) => (d ? new Date(d).toISOString() : null);

export const CARRIERS = ['UPS', 'USPS', 'FedEx', 'DHL', 'Other'];
const TRACKING_URLS = {
  UPS: 'https://www.ups.com/track?tracknum=',
  USPS: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=',
  FedEx: 'https://www.fedex.com/fedextrack/?trknbr=',
  DHL: 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=',
};
export function trackingUrl(carrier, number) {
  if (!number || !TRACKING_URLS[carrier]) return null;
  return `${TRACKING_URLS[carrier]}${encodeURIComponent(number)}`;
}

/** "Box 4 of 12" for one box, "Boxes 4-5 of 12" for several (an en dash, as people write it). */
export function boxLabel(first, last, total) {
  if (first == null || total == null) return null;
  return first === last ? `Box ${first} of ${total}` : `Boxes ${first}–${last} of ${total}`;
}

// ---- Shipping ---------------------------------------------------------------------------

/** What a seller (or TSM, for its own featured orders) sends to mark an order shipped or to correct its tracking number. */
export const shipBody = z.object({
  carrier: z.enum(CARRIERS, { error: 'Choose the carrier' }),
  trackingNumber: z
    .string({ error: 'Enter the tracking number' })
    .trim()
    .min(5, 'Enter the tracking number')
    .max(60, 'That tracking number is too long')
    .regex(/^[A-Za-z0-9 -]+$/, 'Use letters, numbers and dashes only')
    .transform((v) => v.replace(/\s+/g, '')),
});

/** Marks `order` (a loaded order DTO) shipped, or updates its tracking. `body` was checked with shipBody; `actor` is the audit actor. */
export async function shipOrder(order, body, actor) {
  if (order.status === 'delivered' || order.status === 'cancelled') throw conflict(`This order is already ${order.status}`);
  const firstShipment = order.status === 'placed';
  await pool.query(
    "UPDATE orders SET status = 'shipped', carrier = ?, tracking_number = ?, shipped_at = COALESCE(shipped_at, NOW(3)) WHERE id = ?",
    [body.carrier, body.trackingNumber, order.id],
  );
  await addMessage({
    kind: 'order', threadId: order.id, senderType: 'system', senderName: 'TSM', msgKind: 'status',
    body: firstShipment ? `Shipped with ${body.carrier}. Tracking number: ${body.trackingNumber}` : `Tracking updated: ${body.carrier} ${body.trackingNumber}`,
  });
  await audit({
    ...actor, action: firstShipment ? 'order.shipped' : 'order.tracking_updated', entityType: 'order', entityId: order.id,
    details: { orderNumber: order.orderNumber, carrier: body.carrier, trackingNumber: body.trackingNumber },
  });
}

const unavailable = (message, field) =>
  new HttpError(409, 'unavailable', message, field ? [{ field, message }] : undefined);

/**
 * Buys the lines for `buyer` using their saved shipping address.
 * lines: [{ listingId, quantity }]. Everything happens in one transaction: either every line is bought or none is.
 * Returns the created orders (newest data from the database).
 */
export async function placeOrders({ buyer, lines, ip }) {
  // The same offer twice in the cart is one line.
  const wanted = new Map();
  for (const line of lines) wanted.set(line.listingId, (wanted.get(line.listingId) ?? 0) + line.quantity);
  for (const [, quantity] of wanted) {
    if (quantity > MAX_QUANTITY_PER_LINE) {
      throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'items', message: `You can buy at most ${MAX_QUANTITY_PER_LINE} of one offer` }]);
    }
  }

  const orderIds = await withDeadlockRetry(() => withTransaction(async (conn) => {
    const [[address]] = await conn.query('SELECT * FROM user_addresses WHERE user_id = ?', [buyer.id]);
    if (!address) {
      throw new HttpError(400, 'address_required', 'Add a shipping address before you check out', [
        { field: 'address', message: 'Add a shipping address first' },
      ]);
    }

    // Lock the offers (in a fixed order, so two checkouts can never wait on each other) before reading their stock.
    const [rows] = await conn.query(
      `SELECT l.*, sp.status AS seller_status, sp.display_name AS seller_name, sp.is_house AS seller_is_house,
              p.name AS product_name, p.is_active AS product_active, p.thumbnail_key, b.name AS brand_name
         FROM listings l
         JOIN seller_profiles sp ON sp.user_id = l.seller_id
         JOIN products p ON p.id = l.product_id
         JOIN brands b ON b.id = p.brand_id
        WHERE l.id IN (?)
        ORDER BY l.id
          FOR UPDATE OF l`,
      [[...wanted.keys()]],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Then lock the sellers involved, always in the same order. Without this, two shoppers buying DIFFERENT offers from
    // the same seller at the same moment could each hold a read lock on the seller and wait for a write lock (a deadlock).
    if (rows.length) {
      await conn.query(
        'SELECT user_id FROM seller_profiles WHERE user_id IN (?) ORDER BY user_id FOR UPDATE',
        [[...new Set(rows.map((r) => r.seller_id))].sort()],
      );
    }

    const bought = []; // one entry per line, with the box numbers worked out
    for (const [listingId, quantity] of wanted) {
      const l = byId.get(listingId);
      if (!l) throw unavailable('One of the items in your cart is no longer for sale', 'items');
      const name = `${l.product_name} (${l.seller_name})`;
      if (l.seller_id === buyer.id) throw new HttpError(400, 'own_listing', `You can't buy your own offer: ${l.product_name}`);
      if (!l.is_active || l.admin_hold || l.seller_status !== 'active' || !l.product_active || l.quantity_available <= 0) {
        throw unavailable(`${name} is no longer for sale`, 'items');
      }
      if (quantity > l.quantity_available) {
        throw unavailable(`Only ${l.quantity_available} left of ${name}`, 'items');
      }
      const fromCase = l.box_number != null && l.boxes_in_case != null;
      let first = null;
      let last = null;
      let nextBox = l.box_number;
      let nextQuantity = l.quantity_available - quantity;
      let nextPosition = l.box_position;
      if (fromCase) {
        const boxesLeft = l.boxes_in_case - l.box_number + 1;
        if (quantity > boxesLeft) {
          throw unavailable(`Only ${boxesLeft} ${boxesLeft === 1 ? 'box is' : 'boxes are'} left in the case for ${name}`, 'items');
        }
        first = l.box_number;
        last = l.box_number + quantity - 1;
        const caseFinished = last >= l.boxes_in_case;
        nextBox = caseFinished ? l.boxes_in_case : last + 1;
        if (caseFinished) nextQuantity = 0; // no boxes left, whatever the stock number said
        nextPosition = `Box ${nextBox} of ${l.boxes_in_case}`;
      }
      bought.push({ l, quantity, fromCase, first, last, nextBox, nextQuantity, nextPosition });
    }

    const fees = await getFees(conn);
    const checkoutId = randomUUID();
    const bySeller = new Map();
    for (const b of bought) {
      if (!bySeller.has(b.l.seller_id)) bySeller.set(b.l.seller_id, []);
      bySeller.get(b.l.seller_id).push(b);
    }

    const created = [];
    for (const [sellerId, group] of bySeller) {
      const orderId = randomUUID();
      const subtotal = group.reduce((sum, b) => sum + b.quantity * toCents(b.l.price), 0);
      const orderNumber = await withUniqueRef(newOrderNumber, async (number) => {
        await conn.query(
          `INSERT INTO orders (id, order_number, checkout_id, buyer_id, seller_id, status, subtotal_cents,
                               ship_name, ship_line1, ship_line2, ship_city, ship_region, ship_postal_code, ship_country)
           VALUES (?, ?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, number, checkoutId, buyer.id, sellerId, subtotal, address.full_name, address.line1, address.line2,
           address.city, address.region, address.postal_code, address.country],
        );
        return number;
      });

      for (const b of group) {
        const { l } = b;
        const unitPriceCents = toCents(l.price);
        await conn.query(
          `INSERT INTO order_items (id, order_id, listing_id, product_id, product_name, brand_name, thumbnail_key, quantity,
                                    unit_price_cents, source_label, distributor, box_first, box_last, boxes_in_case, box_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), orderId, l.id, l.product_id, l.product_name, l.brand_name, l.thumbnail_key, b.quantity,
           unitPriceCents, l.source, l.distributor, b.first, b.last, b.fromCase ? l.boxes_in_case : null,
           b.fromCase ? boxLabel(b.first, b.last, l.boxes_in_case) : null],
        );
        // This is the line that makes the next buyer get the next box.
        await conn.query(
          'UPDATE listings SET quantity_available = ?, box_number = ?, box_position = ? WHERE id = ?',
          [b.nextQuantity, b.nextBox, b.nextPosition, l.id],
        );
        // The rates in force right now are written onto the earnings row, so this sale keeps them for good.
        // TSM's own storefront takes no fee from itself and is never paid out, so its sales write no ledger row.
        if (!l.seller_is_house) {
          await recordSaleEarning(
            {
              sellerId, listingId: l.id, productName: l.product_name, orderRef: orderNumber,
              quantity: b.quantity, unitPriceCents, bps: fees.tsmFeeBps, processingBps: fees.processingFeeBps,
            },
            conn,
          );
        }
        await conn.query('UPDATE seller_profiles SET sales_count = sales_count + ? WHERE user_id = ?', [b.quantity, sellerId]);
      }

      await audit(
        {
          actorType: 'user', actorId: buyer.id, ip, action: 'order.placed', entityType: 'order', entityId: orderId,
          details: { orderNumber, sellerId, subtotalCents: subtotal, lines: group.length },
        },
        conn,
      );
      created.push(orderId);
    }
    return created;
  }));

  return loadOrders({ ids: orderIds });
}

/** MySQL sometimes picks one of two clashing transactions as the loser (error 1213). Everything inside is safe to run again. */
async function withDeadlockRetry(run, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (err?.errno !== 1213 || attempt >= attempts) throw err;
    }
  }
}

// ---- Reading orders --------------------------------------------------------------------

const ORDER_SELECT = `
  SELECT o.*, sp.display_name AS seller_name, sp.is_house AS seller_is_house, u.username AS buyer_username, u.status AS buyer_status
    FROM orders o
    JOIN seller_profiles sp ON sp.user_id = o.seller_id
    JOIN users u ON u.id = o.buyer_id`;

/**
 * Loads orders with their items (and each item's review).
 *   filters: ids, buyerId, sellerId, status, q (order number / product / buyer), limit, offset
 *   sort: 'newest' (default) or 'oldest'
 * Returns an array of DTOs; use countOrders() for the total.
 * The seller and staff views also get `fees`: what was taken from this sale, at the rates it was made at.
 */
export async function loadOrders({ ids, buyerId, sellerId, status, q, sort = 'newest', limit = 100, offset = 0, view = 'buyer' }, executor = pool) {
  const { whereSql, params } = orderFilter({ ids, buyerId, sellerId, status, q });
  const [orders] = await executor.query(`${ORDER_SELECT} ${whereSql} ORDER BY o.created_at ${dir(sort)}, o.id ${dir(sort)} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  if (!orders.length) return [];
  const [items] = await executor.query(
    `SELECT oi.*, r.id AS review_id, r.rating AS review_rating, r.comment AS review_comment,
            r.seller_response AS review_response, r.seller_responded_at AS review_responded_at, r.created_at AS review_created_at
       FROM order_items oi
       LEFT JOIN reviews r ON r.order_item_id = oi.id
      WHERE oi.order_id IN (?)
      ORDER BY oi.created_at, oi.product_name`,
    [orders.map((o) => o.id)],
  );
  let feesByOrder = new Map();
  if (view !== 'buyer') {
    const [fees] = await executor.query(
      `SELECT order_ref, SUM(gross_cents) AS gross, SUM(commission_cents) AS commission, SUM(processing_fee_cents) AS processing,
              SUM(net_cents) AS net, MAX(commission_bps) AS commission_bps, MAX(processing_fee_bps) AS processing_fee_bps
         FROM seller_earnings WHERE order_ref IN (?) GROUP BY order_ref`,
      [orders.map((o) => o.order_number)],
    );
    feesByOrder = new Map(fees.map((f) => [f.order_ref, f]));
  }
  return orders.map((o) => orderDto(o, items.filter((i) => i.order_id === o.id), view, feesByOrder.get(o.order_number)));
}

export async function countOrders(filters, executor = pool) {
  const { whereSql, params } = orderFilter(filters);
  const [[row]] = await executor.query(`SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.buyer_id ${whereSql}`, params);
  return Number(row.total);
}

function orderFilter({ ids, buyerId, sellerId, status, q }) {
  const where = [];
  const params = [];
  if (ids) { where.push('o.id IN (?)'); params.push(ids.length ? ids : ['']); }
  if (buyerId) { where.push('o.buyer_id = ?'); params.push(buyerId); }
  if (sellerId) { where.push('o.seller_id = ?'); params.push(sellerId); }
  if (status && status !== 'all') { where.push('o.status = ?'); params.push(status); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push('(o.order_number LIKE ? OR u.username LIKE ? OR EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.product_name LIKE ?))');
    params.push(like, like, like);
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/** One order the person is allowed to see, or a 404. */
export async function loadOrderFor(orderId, { buyerId, sellerId }, view) {
  const [order] = await loadOrders({ ids: [orderId], buyerId, sellerId, view });
  if (!order) throw notFound('Order not found');
  return order;
}

export function orderDto(o, items, view = 'buyer', fee = null) {
  const dto = {
    id: o.id,
    orderNumber: o.order_number,
    checkoutId: o.checkout_id,
    status: o.status,
    subtotalCents: Number(o.subtotal_cents),
    createdAt: iso(o.created_at),
    shippedAt: iso(o.shipped_at),
    deliveredAt: iso(o.delivered_at),
    carrier: o.carrier ?? null,
    trackingNumber: o.tracking_number ?? null,
    trackingUrl: trackingUrl(o.carrier, o.tracking_number),
    seller: { id: o.seller_id, displayName: o.seller_name, isTsm: Boolean(o.seller_is_house) },
    shippingAddress: {
      fullName: o.ship_name,
      line1: o.ship_line1,
      line2: o.ship_line2 ?? null,
      city: o.ship_city,
      region: o.ship_region,
      postalCode: o.ship_postal_code,
      country: o.ship_country,
    },
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      productName: i.product_name,
      brandName: i.brand_name,
      thumbnailUrl: mediaPath(i.thumbnail_key),
      quantity: Number(i.quantity),
      unitPriceCents: Number(i.unit_price_cents),
      lineTotalCents: Number(i.quantity) * Number(i.unit_price_cents),
      sourceLabel: i.source_label ?? null,
      distributor: i.distributor ?? null,
      boxLabel: i.box_label ?? null,
      boxFirst: i.box_first ?? null,
      boxLast: i.box_last ?? null,
      boxesInCase: i.boxes_in_case ?? null,
      review: i.review_id
        ? {
            id: i.review_id,
            rating: Number(i.review_rating),
            comment: i.review_comment ?? null,
            sellerResponse: i.review_response ?? null,
            sellerRespondedAt: iso(i.review_responded_at),
            createdAt: iso(i.review_created_at),
          }
        : null,
    })),
  };
  // A seller sees who bought (the username only) and where to ship; a buyer does not need their own username back.
  if (view === 'seller') dto.buyer = { id: o.buyer_id, username: o.buyer_status === 'deleted' ? 'TSM buyer' : o.buyer_username };
  if (view === 'staff') dto.buyer = { id: o.buyer_id, username: o.buyer_username };
  // What was taken from this sale, at the rates in force WHEN IT WAS MADE (null for TSM's own sales, which take no fee).
  if (view !== 'buyer') {
    dto.fees = fee
      ? {
          tsmFeeBps: Number(fee.commission_bps),
          processingFeeBps: Number(fee.processing_fee_bps),
          grossCents: Number(fee.gross),
          commissionCents: Number(fee.commission),
          processingFeeCents: Number(fee.processing),
          netCents: Number(fee.net),
        }
      : null;
  }
  return dto;
}
