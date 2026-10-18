// Public: read what buyers said about a seller or a product. No sign-in needed.
//
//   GET /api/sellers/:id/reviews     ?limit, offset            star summary + reviews of one seller (with the seller's replies)
//   GET /api/products/:id/reviews    ?sellerId, limit, offset  star summary + reviews of one product, from every seller
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
  const f = parse(z.object({ sellerId: z.string().regex(UUID_RE).optional(), ...page }), req.query);
  const [[product]] = await pool.query('SELECT id, name FROM products WHERE id = ?', [req.params.id]);
  if (!product) throw notFound('Product not found');
  const where = ['r.product_id = ?'];
  const params = [product.id];
  if (f.sellerId) { where.push('r.seller_id = ?'); params.push(f.sellerId); }
  const [rows] = await pool.query(
    `${REVIEW_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC, r.id LIMIT ? OFFSET ?`,
    [...params, f.limit, f.offset],
  );
  const summary = await reviewSummary({ productId: product.id, sellerId: f.sellerId ?? null });
  res.json({ product: { id: product.id, name: product.name }, summary, items: rows.map(reviewDto), total: summary.count, limit: f.limit, offset: f.offset });
});

export default router;
