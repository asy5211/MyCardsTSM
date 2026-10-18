// A buyer's favorite sellers (the heart next to a seller's name).
//
//   GET    /api/me/favorite-sellers              the sellers I hearted, newest first
//   PUT    /api/me/favorite-sellers/:sellerId    heart a seller (saving it twice is fine)
//   DELETE /api/me/favorite-sellers/:sellerId    un-heart a seller (also fine if it was never hearted)
//
// Any signed-in person can favorite a seller, including TSM's own store; you cannot favorite yourself.
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
router.use(requireUser);

const iso = (d) => (d ? new Date(d).toISOString() : null);

function sellerDto(row) {
  return {
    id: row.user_id,
    displayName: row.display_name,
    rating: Number(row.rating_avg),
    ratingCount: Number(row.rating_count),
    salesCount: Number(row.sales_count),
    isTsm: Boolean(row.is_house),
    liveListingCount: Number(row.live_listings ?? 0),
    favoritedAt: iso(row.favorited_at),
  };
}

router.get('/', async (req, res) => {
  const f = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(100), offset: z.coerce.number().int().min(0).default(0) }), req.query);
  const [rows] = await pool.query(
    `SELECT sp.user_id, sp.display_name, sp.rating_avg, sp.rating_count, sp.sales_count, sp.is_house, fs.created_at AS favorited_at,
            (SELECT COUNT(*) FROM listings l WHERE l.seller_id = sp.user_id AND l.is_active = 1 AND l.admin_hold = 0 AND l.quantity_available > 0) AS live_listings
       FROM favorite_sellers fs
       JOIN seller_profiles sp ON sp.user_id = fs.seller_id
      WHERE fs.user_id = ? AND sp.status = 'active'
      ORDER BY fs.created_at DESC, sp.user_id
      LIMIT ? OFFSET ?`,
    [req.user.id, f.limit, f.offset],
  );
  res.json({ items: rows.map(sellerDto) });
});

async function sellerOrNotFound(id) {
  if (!UUID_RE.test(id)) throw notFound('Seller not found');
  const [[seller]] = await pool.query("SELECT user_id FROM seller_profiles WHERE user_id = ? AND status = 'active'", [id]);
  if (!seller) throw notFound('Seller not found');
  return seller.user_id;
}

router.put('/:sellerId', async (req, res) => {
  const sellerId = await sellerOrNotFound(req.params.sellerId);
  if (sellerId === req.user.id) throw new HttpError(400, 'own_store', 'You can’t favorite your own store');
  await pool.query('INSERT IGNORE INTO favorite_sellers (user_id, seller_id) VALUES (?, ?)', [req.user.id, sellerId]);
  res.json({ sellerId, isFavorite: true });
});

router.delete('/:sellerId', async (req, res) => {
  if (!UUID_RE.test(req.params.sellerId)) throw notFound('Seller not found');
  await pool.query('DELETE FROM favorite_sellers WHERE user_id = ? AND seller_id = ?', [req.user.id, req.params.sellerId]);
  res.status(204).end();
});

export default router;
