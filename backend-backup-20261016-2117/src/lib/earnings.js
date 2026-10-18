// Seller earnings: what a seller is owed for each sale, after TSM's commission and the payment (Apple) fee.
// Money is integer cents. Checkout (lib/orders.js) calls recordSaleEarning() for every order line.
// Both rates are written onto the row, so a later change of the rates never rewrites an old sale.
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';

/** gross x rate, rounded to the nearest cent (half up). 14999 at 300 bps -> 450. */
export function commissionCents(grossCents, bps = config.commissionBps) {
  return Math.round((grossCents * bps) / 10000);
}

/**
 * Writes one row of the earnings ledger for a sold order line. Pass a transaction connection as `executor` to make it part of the order.
 * bps = TSM's rate, processingBps = the payment / Apple fee rate. net = gross - commission - processing fee.
 */
export async function recordSaleEarning(
  { sellerId, listingId = null, productName, orderRef, quantity, unitPriceCents, bps = config.commissionBps, processingBps = 0 },
  executor = pool,
) {
  const gross = quantity * unitPriceCents;
  const commission = commissionCents(gross, bps);
  const processing = commissionCents(gross, processingBps);
  const net = gross - commission - processing;
  const id = randomUUID();
  await executor.query(
    `INSERT INTO seller_earnings
       (id, seller_id, listing_id, product_name, order_ref, quantity, unit_price_cents, gross_cents,
        commission_bps, commission_cents, processing_fee_bps, processing_fee_cents, net_cents, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
    [id, sellerId, listingId, productName, orderRef, quantity, unitPriceCents, gross, bps, commission, processingBps, processing, net],
  );
  return { id, grossCents: gross, commissionCents: commission, processingFeeCents: processing, netCents: net };
}

export function earningDto(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    productName: row.product_name,
    orderRef: row.order_ref,
    quantity: Number(row.quantity),
    unitPriceCents: Number(row.unit_price_cents),
    grossCents: Number(row.gross_cents),
    commissionBps: Number(row.commission_bps),
    commissionCents: Number(row.commission_cents),
    processingFeeBps: Number(row.processing_fee_bps ?? 0),
    processingFeeCents: Number(row.processing_fee_cents ?? 0),
    netCents: Number(row.net_cents),
    status: row.status,
    payoutId: row.payout_id ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

export function payoutDto(row) {
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.display_name ?? undefined,
    amountCents: Number(row.amount_cents),
    earningsCount: Number(row.earnings_count),
    status: row.status,
    reference: row.reference ?? null,
    note: row.note ?? null,
    createdAt: iso(row.created_at),
    paidAt: iso(row.paid_at),
    cancelledAt: iso(row.cancelled_at),
  };
}

/** The four balances for one seller (or, with no sellerId, for everyone). */
export async function earningTotals(sellerId = null, executor = pool) {
  const [[row]] = await executor.query(
    `SELECT
        COALESCE(SUM(CASE WHEN status = 'available' THEN net_cents END), 0) AS available,
        COALESCE(SUM(CASE WHEN status = 'in_payout' THEN net_cents END), 0) AS inPayout,
        COALESCE(SUM(CASE WHEN status = 'paid'      THEN net_cents END), 0) AS paid,
        COALESCE(SUM(CASE WHEN status <> 'reversed' THEN gross_cents END), 0) AS gross,
        COALESCE(SUM(CASE WHEN status <> 'reversed' THEN commission_cents END), 0) AS commission,
        COALESCE(SUM(CASE WHEN status <> 'reversed' THEN processing_fee_cents END), 0) AS processing
       FROM seller_earnings
      ${sellerId ? 'WHERE seller_id = ?' : ''}`,
    sellerId ? [sellerId] : [],
  );
  return {
    availableCents: Number(row.available),
    inPayoutCents: Number(row.inPayout),
    paidCents: Number(row.paid),
    grossCents: Number(row.gross),
    commissionCents: Number(row.commission),
    processingFeeCents: Number(row.processing),
  };
}
