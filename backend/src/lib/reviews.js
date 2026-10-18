// Reviews: a buyer rates the seller for one item they bought (1-5 stars + a comment); the seller can answer once.
import { pool } from '../db.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Recalculates a seller's star average and review count from their reviews. Call it inside the same transaction as the change. */
export async function recomputeSellerRating(sellerId, executor = pool) {
  await executor.query(
    `UPDATE seller_profiles
        SET rating_avg   = (SELECT COALESCE(ROUND(AVG(rating), 2), 0) FROM reviews WHERE seller_id = ?),
            rating_count = (SELECT COUNT(*) FROM reviews WHERE seller_id = ?)
      WHERE user_id = ?`,
    [sellerId, sellerId, sellerId],
  );
}

/** Rows come from reviews r JOIN users u (buyer) JOIN products p JOIN seller_profiles sp. */
export const REVIEW_SELECT = `
  SELECT r.*, u.username AS buyer_username, u.status AS buyer_status, p.name AS product_name, p.thumbnail_key,
         sp.display_name AS seller_name, oi.box_label, o.order_number
    FROM reviews r
    JOIN users u ON u.id = r.buyer_id
    JOIN products p ON p.id = r.product_id
    JOIN seller_profiles sp ON sp.user_id = r.seller_id
    JOIN order_items oi ON oi.id = r.order_item_id
    JOIN orders o ON o.id = r.order_id`;

export function reviewDto(row) {
  return {
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment ?? null,
    // People who deleted their account are shown as "TSM buyer", never by their old name.
    reviewer: row.buyer_status === 'deleted' ? 'TSM buyer' : row.buyer_username,
    productId: row.product_id,
    productName: row.product_name,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    orderNumber: row.order_number,
    boxLabel: row.box_label ?? null,
    sellerResponse: row.seller_response ?? null,
    sellerRespondedAt: iso(row.seller_responded_at),
    createdAt: iso(row.created_at),
  };
}

/** Star summary for a seller (or, with productId, for one product across all sellers). */
export async function reviewSummary({ sellerId = null, productId = null }, executor = pool) {
  const where = [];
  const params = [];
  if (sellerId) { where.push('seller_id = ?'); params.push(sellerId); }
  if (productId) { where.push('product_id = ?'); params.push(productId); }
  const [[row]] = await executor.query(
    `SELECT COUNT(*) AS count, COALESCE(ROUND(AVG(rating), 2), 0) AS average,
            COALESCE(SUM(rating = 1), 0) AS s1, COALESCE(SUM(rating = 2), 0) AS s2, COALESCE(SUM(rating = 3), 0) AS s3,
            COALESCE(SUM(rating = 4), 0) AS s4, COALESCE(SUM(rating = 5), 0) AS s5
       FROM reviews ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    params,
  );
  return {
    count: Number(row.count),
    average: Number(row.average),
    distribution: { 1: Number(row.s1), 2: Number(row.s2), 3: Number(row.s3), 4: Number(row.s4), 5: Number(row.s5) },
  };
}
