// Public shop data: brands, product types, product list, product detail.
// Prices go out as integer cents. Sold-out rules (spec 5.4):
//   * a seller with 0 stock simply vanishes from the product's offers
//   * the product itself stays visible, marked isFullySoldOut, when every seller is out
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { notFound } from '../errors.js';
import { SOURCE_LABELS } from '../lib/listings.js';
import { mediaPath } from '../lib/media.js';
import { toCents } from '../lib/money.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { optionalUser } from '../middleware/auth.js';

const router = Router();

router.get('/brands', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, sort_order AS sortOrder, image_key AS imageKey FROM brands WHERE is_active = 1 ORDER BY sort_order, name',
  );
  res.json(rows);
});

router.get('/product-types', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM product_types ORDER BY sort_order, name');
  res.json(rows);
});

const listQuery = z.object({
  brand: z.string().trim().min(1).max(60).optional(),
  type: z.string().trim().min(1).max(60).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'sellers']).default('name'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Sold-out products (no price) always sort last when sorting by price.
const ORDER_BY = {
  name: 's.product_name ASC',
  price_asc: '(s.lowest_price IS NULL), s.lowest_price ASC, s.product_name ASC',
  price_desc: '(s.lowest_price IS NULL), s.lowest_price DESC, s.product_name ASC',
  sellers: 's.seller_count DESC, s.product_name ASC',
};

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

router.get('/products', async (req, res) => {
  const { brand, type, q, sort, limit, offset } = parse(listQuery, req.query);

  // Filters are built from fixed fragments; user text only ever travels as bound parameters.
  const where = [];
  const params = [];
  if (brand) {
    where.push('s.brand = ?'); // accent/case-insensitive: "pokemon" matches "Pokémon"
    params.push(brand);
  }
  if (type) {
    where.push('s.product_type = ?');
    params.push(type);
  }
  if (q) {
    where.push('(s.product_name LIKE ? OR s.brand LIKE ?)');
    params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM v_product_summary s ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT s.product_id AS id, s.product_name AS name, s.brand, s.product_type AS type,
            p.thumbnail_key AS thumbnailKey, s.lowest_price AS lowestPrice,
            s.seller_count AS sellerCount, s.is_fully_sold_out AS isFullySoldOut
       FROM v_product_summary s
       JOIN products p ON p.id = s.product_id
       ${whereSql}
      ORDER BY ${ORDER_BY[sort]}
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      type: r.type,
      thumbnailKey: r.thumbnailKey,
      thumbnailUrl: mediaPath(r.thumbnailKey),
      lowestPriceCents: toCents(r.lowestPrice),
      sellerCount: Number(r.sellerCount),
      isFullySoldOut: Boolean(r.isFullySoldOut),
    })),
    total: Number(total),
    limit,
    offset,
  });
});

router.get('/products/:id', optionalUser, async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw notFound('Product not found');

  const [[product]] = await pool.query(
    `SELECT p.id, p.name, p.description, p.thumbnail_key AS thumbnailKey,
            s.brand, s.product_type AS type, s.lowest_price AS lowestPrice,
            s.seller_count AS sellerCount, s.is_fully_sold_out AS isFullySoldOut
       FROM products p
       JOIN v_product_summary s ON s.product_id = p.id
      WHERE p.id = ?`,
    [id],
  );
  if (!product) throw notFound('Product not found');

  const [images] = await pool.query(
    'SELECT slot, image_key AS imageKey FROM product_images WHERE product_id = ? ORDER BY slot',
    [id],
  );

  // Cheapest first; the signed-in seller's own offer is pinned to the top (shown gold in the app).
  const viewerId = req.user?.id ?? '';
  const [listings] = await pool.query(
    `SELECT l.id, l.price, l.source, l.box_position AS boxPosition, l.box_number AS boxNumber, l.boxes_in_case AS boxesInCase,
            l.source_type AS sourceType, l.distributor, l.condition_label AS conditionLabel,
            l.quantity_available AS quantityAvailable, l.seller_id AS sellerId,
            sp.display_name AS displayName, sp.rating_avg AS rating, sp.rating_count AS ratingCount, sp.sales_count AS salesCount
       FROM listings l
       JOIN seller_profiles sp ON sp.user_id = l.seller_id
      WHERE l.product_id = ? AND l.is_active = 1 AND l.admin_hold = 0 AND sp.status = 'active' AND l.quantity_available > 0
      ORDER BY (l.seller_id = ?) DESC, l.price ASC, l.id ASC`,
    [id, viewerId],
  );

  res.json({
    id: product.id,
    name: product.name,
    brand: product.brand,
    type: product.type,
    description: product.description,
    thumbnailKey: product.thumbnailKey,
    thumbnailUrl: mediaPath(product.thumbnailKey),
    images: images.map((i) => ({ slot: i.slot, imageKey: i.imageKey, url: mediaPath(i.imageKey) })),
    lowestPriceCents: toCents(product.lowestPrice),
    sellerCount: Number(product.sellerCount),
    isFullySoldOut: Boolean(product.isFullySoldOut),
    listings: listings.map((l) => ({
      id: l.id,
      priceCents: toCents(l.price),
      source: l.source,
      boxPosition: l.boxPosition,
      boxNumber: l.boxNumber,
      boxesInCase: l.boxesInCase,
      sourceType: l.sourceType,
      sourceLabel: SOURCE_LABELS[l.sourceType] ?? l.sourceType,
      distributor: l.distributor,
      condition: l.conditionLabel,
      quantityAvailable: l.quantityAvailable,
      isMine: l.sellerId === viewerId,
      seller: {
        id: l.sellerId,
        displayName: l.displayName,
        rating: Number(l.rating),
        ratingCount: Number(l.ratingCount),
        salesCount: l.salesCount,
        isVerified: true,
      },
    })),
  });
});

export default router;
