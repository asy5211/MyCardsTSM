// Public: read what buyers said about a seller or a product. No sign-in needed.
//
//   GET /api/sellers/:id/reviews     ?limit, offset            star summary + reviews of one seller (with the seller's replies)
//   GET /api/products/:id/reviews    ?sellerId (required), limit, offset  what buyers said about ONE seller's service on this product
//
// A review is about the seller, not about the product, so reviews of a product are only ever listed per seller
// (each offer on a product page shows its own seller's reviews for that product).
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { notFound } from '../errors.js';
import { REVIEW_SELECT, reviewDto, reviewSummary } from '../lib/reviews.js';
import { parse, UUID_RE } from '../lib/validate.js';

const router = Router();
const page = { limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) };

router.get('/sellers/:id/reviews', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw notFound('Seller not found');
  const f = parse(z.object(page), req.query);
  const [[seller]] = await pool.query('SELECT user_id, display_name, rating_avg, rating_count, sales_count FROM seller_profiles WHERE user_id = ?', [req.params.id]);
  if (!seller) throw notFound('Seller not found');
  const [rows] = await pool.query(`${REVIEW_SELECT} WHERE r.seller_id = ? ORDER BY r.created_at DESC, r.id LIMIT ? OFFSET ?`, [seller.user_id, f.limit, f.offset]);
  const summary = await reviewSummary({ sellerId: seller.user_id });
  res.json({
    seller: { id: seller.user_id, displayName: seller.display_name, salesCount: seller.sales_count },
    summary,
    items: rows.map(reviewDto),
    total: summary.count,
    limit: f.limit,
    offset: f.offset,
  });
});

router.get('/products/:id/reviews', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw notFound('Product not found');
  const f = parse(
    z.object({ sellerId: z.string({ error: 'Say which seller’s reviews you want' }).regex(UUID_RE, 'That is not a valid seller'), ...page }),
    req.query,
  );
  const [[product]] = await pool.query('SELECT id, name FROM products WHERE id = ?', [req.params.id]);
  if (!product) throw notFound('Product not found');
  const [[seller]] = await pool.query('SELECT user_id, display_name, is_house FROM seller_profiles WHERE user_id = ?', [f.sellerId]);
  if (!seller) throw notFound('Seller not found');
  const [rows] = await pool.query(
    `${REVIEW_SELECT} WHERE r.product_id = ? AND r.seller_id = ? ORDER BY r.created_at DESC, r.id LIMIT ? OFFSET ?`,
    [product.id, seller.user_id, f.limit, f.offset],
  );
  const summary = await reviewSummary({ productId: product.id, sellerId: seller.user_id });
  res.json({
    product: { id: product.id, name: product.name },
    seller: { id: seller.user_id, displayName: seller.display_name, isTsm: Boolean(seller.is_house) },
    summary,
    items: rows.map(reviewDto),
    total: summary.count,
    limit: f.limit,
    offset: f.offset,
  });
});

export default router;
