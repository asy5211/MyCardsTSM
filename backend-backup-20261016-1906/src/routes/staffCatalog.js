// Staff: build the catalog that sellers pick from and the mobile app shows.
//
//   GET    /api/staff/brands                       all brands (with how many products each has)
//   POST   /api/staff/brands                       {name, sortOrder?}
//   PATCH  /api/staff/brands/:id                   {name?, sortOrder?, isActive?}
//   GET    /api/staff/product-types                the fixed list of product types
//   GET    /api/staff/products                     ?q, brandId, typeId, status=all|active|inactive|needs_content, limit, offset
//   POST   /api/staff/products                     {brandId, productTypeId, name, description}
//   GET    /api/staff/products/:id                 one product with its photos
//   PATCH  /api/staff/products/:id                 {name?, description?, brandId?, productTypeId?, isActive?}
//   POST   /api/staff/products/:id/images          multipart: image (file) + slot (1-3); replaces that slot
//   DELETE /api/staff/products/:id/images/:slot
//
// Reading is open to every staff role; changing things needs "admin" or "super_admin".
// A product is READY for sellers (and shows in their picker) when it is active, has a
// description, and has its main (slot 1) photo. Photos are stored by uploads and served from /media.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { audit } from '../lib/audit.js';
import { isStoredImageKey, mediaPath, productImageKey, sniffImage } from '../lib/media.js';
import { deleteFiles, saveFile } from '../lib/uploads.js';
import { parse, UUID_RE } from '../lib/validate.js';
import { requireStaff } from '../middleware/auth.js';

const router = Router();
const read = requireStaff();
const write = requireStaff('super_admin', 'admin');

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const actor = (req) => ({ actorType: 'staff', actorId: req.staff.id, ip: req.ip });

function idParam(req) {
  if (!UUID_RE.test(req.params.id)) throw notFound();
  return req.params.id;
}

// ---- Brands ------------------------------------------------------------------------

const brandBody = z.object({
  name: z.string().trim().min(1, 'Enter the brand name').max(60, 'Keep the name under 60 characters'),
  sortOrder: z.number().int().min(-9999).max(9999).optional(),
});

function brandDto(row) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    productCount: Number(row.product_count ?? 0),
  };
}

router.get('/brands', read, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS product_count
       FROM brands b ORDER BY b.sort_order, b.name`,
  );
  res.json(rows.map(brandDto));
});

router.post('/brands', write, async (req, res) => {
  const body = parse(brandBody, req.body);
  const [[dupe]] = await pool.query('SELECT id FROM brands WHERE name = ?', [body.name]);
  if (dupe) throw conflict('There is already a brand with that name', [{ field: 'name', message: 'Already used' }]);
  const id = randomUUID();
  await pool.query('INSERT INTO brands (id, name, sort_order) VALUES (?, ?, ?)', [id, body.name, body.sortOrder ?? 0]);
  await audit({ ...actor(req), action: 'brand.created', entityType: 'brand', entityId: id, details: { name: body.name } });
  const [[row]] = await pool.query('SELECT *, 0 AS product_count FROM brands WHERE id = ?', [id]);
  res.status(201).json(brandDto(row));
});

router.patch('/brands/:id', write, async (req, res) => {
  const id = idParam(req);
  const body = parse(brandBody.partial().extend({ isActive: z.boolean().optional() }), req.body);
  const [[brand]] = await pool.query('SELECT * FROM brands WHERE id = ?', [id]);
  if (!brand) throw notFound('Brand not found');
  if (body.name !== undefined && body.name.toLowerCase() !== brand.name.toLowerCase()) {
    const [[dupe]] = await pool.query('SELECT id FROM brands WHERE name = ? AND id <> ?', [body.name, id]);
    if (dupe) throw conflict('There is already a brand with that name', [{ field: 'name', message: 'Already used' }]);
  }
  await pool.query(
    'UPDATE brands SET name = ?, sort_order = ?, is_active = ? WHERE id = ?',
    [body.name ?? brand.name, body.sortOrder ?? brand.sort_order, body.isActive === undefined ? brand.is_active : body.isActive ? 1 : 0, id],
  );
  await audit({ ...actor(req), action: 'brand.updated', entityType: 'brand', entityId: id, details: { before: { name: brand.name, isActive: Boolean(brand.is_active) }, changes: body } });
  const [[row]] = await pool.query(
    'SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS product_count FROM brands b WHERE b.id = ?',
    [id],
  );
  res.json(brandDto(row));
});

router.get('/product-types', read, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM product_types ORDER BY sort_order, name');
  res.json(rows);
});

// ---- Products ----------------------------------------------------------------------

const productFields = z.object({
  brandId: z.string({ error: 'Choose a brand' }).regex(UUID_RE, 'Choose a brand'),
  productTypeId: z.string({ error: 'Choose a product type' }).regex(UUID_RE, 'Choose a product type'),
  name: z.string({ error: 'Enter the product name' }).trim().min(2, 'Enter the product name').max(160, 'Keep the name under 160 characters'),
  description: z
    .string({ error: 'Write a description for buyers' })
    .trim()
    .min(10, 'Write a short description for buyers (at least 10 characters)')
    .max(4000, 'Keep the description under 4000 characters'),
});
const createProductBody = productFields;
const patchProductBody = productFields.partial().extend({ isActive: z.boolean().optional() });

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.description, p.is_active, p.thumbnail_key, p.created_at, p.updated_at,
         b.id AS brand_id, b.name AS brand_name, pt.id AS type_id, pt.name AS type_name,
         (SELECT COUNT(*) FROM listings l WHERE l.product_id = p.id) AS listing_count,
         (SELECT COUNT(*) FROM listings l JOIN seller_profiles sp ON sp.user_id = l.seller_id
           WHERE l.product_id = p.id AND l.is_active = 1 AND l.admin_hold = 0 AND sp.status = 'active'
             AND l.quantity_available > 0) AS live_listing_count
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    JOIN product_types pt ON pt.id = p.product_type_id`;

function productDto(row, images = []) {
  const main = images.find((i) => i.slot === 1);
  const hasPhoto = Boolean(main?.url);
  const hasDescription = Boolean(row.description && row.description.trim().length >= 10);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    brand: { id: row.brand_id, name: row.brand_name },
    type: { id: row.type_id, name: row.type_name },
    isActive: Boolean(row.is_active),
    thumbnailUrl: mediaPath(row.thumbnail_key),
    images,
    hasPhoto,
    hasDescription,
    // Sellers can only list products that are ready.
    isReady: Boolean(row.is_active) && hasPhoto && hasDescription,
    listingCount: Number(row.listing_count ?? 0),
    liveListingCount: Number(row.live_listing_count ?? 0),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function loadImages(productIds, executor = pool) {
  if (!productIds.length) return new Map();
  const [rows] = await executor.query(
    'SELECT product_id, slot, image_key FROM product_images WHERE product_id IN (?) ORDER BY slot',
    [productIds],
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, []);
    map.get(r.product_id).push({ slot: r.slot, imageKey: r.image_key, url: mediaPath(r.image_key) });
  }
  return map;
}

async function loadProduct(id, executor = pool) {
  const [[row]] = await executor.query(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
  if (!row) throw notFound('Product not found');
  const images = (await loadImages([id], executor)).get(id) ?? [];
  return productDto(row, images);
}

async function checkBrandAndType({ brandId, productTypeId }) {
  if (brandId) {
    const [[b]] = await pool.query('SELECT id FROM brands WHERE id = ?', [brandId]);
    if (!b) throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'brandId', message: 'That brand does not exist' }]);
  }
  if (productTypeId) {
    const [[t]] = await pool.query('SELECT id FROM product_types WHERE id = ?', [productTypeId]);
    if (!t) throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'productTypeId', message: 'That product type does not exist' }]);
  }
}

const productListQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  brandId: z.string().regex(UUID_RE).optional(),
  typeId: z.string().regex(UUID_RE).optional(),
  status: z.enum(['all', 'active', 'inactive', 'needs_content']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/products', read, async (req, res) => {
  const f = parse(productListQuery, req.query);
  const where = [];
  const params = [];
  if (f.q) {
    where.push('(p.name LIKE ? OR b.name LIKE ?)');
    params.push(`%${escapeLike(f.q)}%`, `%${escapeLike(f.q)}%`);
  }
  if (f.brandId) { where.push('p.brand_id = ?'); params.push(f.brandId); }
  if (f.typeId) { where.push('p.product_type_id = ?'); params.push(f.typeId); }
  if (f.status === 'active') where.push('p.is_active = 1');
  if (f.status === 'inactive') where.push('p.is_active = 0');
  if (f.status === 'needs_content') {
    where.push(`(p.description IS NULL OR CHAR_LENGTH(TRIM(p.description)) < 10
                 OR NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id AND i.slot = 1 AND i.image_key LIKE 'products/%'))`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p JOIN brands b ON b.id = p.brand_id ${whereSql}`,
    params,
  );
  const [rows] = await pool.query(`${PRODUCT_SELECT} ${whereSql} ORDER BY b.name, p.name LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  const images = await loadImages(rows.map((r) => r.id));
  res.json({ items: rows.map((r) => productDto(r, images.get(r.id) ?? [])), total: Number(total), limit: f.limit, offset: f.offset });
});

router.post('/products', write, async (req, res) => {
  const body = parse(createProductBody, req.body);
  await checkBrandAndType(body);
  const [[dupe]] = await pool.query('SELECT id FROM products WHERE brand_id = ? AND name = ?', [body.brandId, body.name]);
  if (dupe) throw conflict('That brand already has a product with this name', [{ field: 'name', message: 'Already used for this brand' }]);
  const id = randomUUID();
  await pool.query(
    'INSERT INTO products (id, brand_id, product_type_id, name, description) VALUES (?, ?, ?, ?, ?)',
    [id, body.brandId, body.productTypeId, body.name, body.description],
  );
  await audit({ ...actor(req), action: 'product.created', entityType: 'product', entityId: id, details: { name: body.name } });
  res.status(201).json(await loadProduct(id));
});

router.get('/products/:id', read, async (req, res) => {
  res.json(await loadProduct(idParam(req)));
});

router.patch('/products/:id', write, async (req, res) => {
  const id = idParam(req);
  const body = parse(patchProductBody, req.body);
  const [[product]] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) throw notFound('Product not found');
  await checkBrandAndType(body);
  const next = {
    brand_id: body.brandId ?? product.brand_id,
    product_type_id: body.productTypeId ?? product.product_type_id,
    name: body.name ?? product.name,
    description: body.description ?? product.description,
    is_active: body.isActive === undefined ? product.is_active : body.isActive ? 1 : 0,
  };
  if (next.brand_id !== product.brand_id || next.name !== product.name) {
    const [[dupe]] = await pool.query('SELECT id FROM products WHERE brand_id = ? AND name = ? AND id <> ?', [next.brand_id, next.name, id]);
    if (dupe) throw conflict('That brand already has a product with this name', [{ field: 'name', message: 'Already used for this brand' }]);
  }
  await pool.query(
    'UPDATE products SET brand_id = ?, product_type_id = ?, name = ?, description = ?, is_active = ? WHERE id = ?',
    [next.brand_id, next.product_type_id, next.name, next.description, next.is_active, id],
  );
  const action = body.isActive === undefined || Object.keys(body).length > 1 ? 'product.updated'
    : body.isActive ? 'product.activated' : 'product.deactivated';
  await audit({
    ...actor(req),
    action,
    entityType: 'product',
    entityId: id,
    details: { name: product.name, changed: Object.keys(body) },
  });
  res.json(await loadProduct(id));
});

// ---- Product photos ----------------------------------------------------------------

const receiveImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxProductImageBytes, files: 1, fields: 5, fieldSize: 1024 },
}).single('image');

function receive(req, res, next) {
  receiveImage(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const mb = Math.round(config.maxProductImageBytes / (1024 * 1024));
      const known = {
        LIMIT_FILE_SIZE: new HttpError(413, 'file_too_large', `The photo must be ${mb} MB or smaller`),
        LIMIT_FILE_COUNT: new HttpError(400, 'too_many_files', 'Send one photo at a time'),
        LIMIT_UNEXPECTED_FILE: new HttpError(400, 'too_many_files', 'Send one photo at a time, in the "image" field'),
      };
      return next(known[err.code] ?? new HttpError(400, 'upload_failed', 'The upload could not be read'));
    }
    return next(err);
  });
}

const slotBody = z.object({
  slot: z.coerce.number({ error: 'Choose which photo slot (1-3)' }).int().min(1, 'Slot is 1 to 3').max(3, 'Slot is 1 to 3'),
});

router.post('/products/:id/images', write, receive, async (req, res) => {
  const id = idParam(req);
  const { slot } = parse(slotBody, req.body);
  if (!req.file) throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'image', message: 'Choose a photo to upload' }]);
  const type = sniffImage(req.file.buffer);
  if (!type) {
    throw new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field: 'image', message: 'The photo must be a JPEG, PNG or WebP picture' }]);
  }
  const [[product]] = await pool.query('SELECT id, name FROM products WHERE id = ?', [id]);
  if (!product) throw notFound('Product not found');

  const key = productImageKey(id, type.ext);
  await saveFile(key, req.file.buffer);
  let oldKey = null;
  try {
    oldKey = await withTransaction(async (conn) => {
      const [[existing]] = await conn.query('SELECT id, image_key FROM product_images WHERE product_id = ? AND slot = ? FOR UPDATE', [id, slot]);
      if (existing) {
        await conn.query('UPDATE product_images SET image_key = ? WHERE id = ?', [key, existing.id]);
      } else {
        await conn.query('INSERT INTO product_images (id, product_id, slot, image_key) VALUES (?, ?, ?, ?)', [randomUUID(), id, slot, key]);
      }
      // The grid thumbnail is always the first photo.
      if (slot === 1) await conn.query('UPDATE products SET thumbnail_key = ? WHERE id = ?', [key, id]);
      return existing?.image_key ?? null;
    });
  } catch (err) {
    await deleteFiles([key]);
    throw err;
  }
  if (isStoredImageKey(oldKey)) await deleteFiles([oldKey]);
  await audit({ ...actor(req), action: 'product.image_set', entityType: 'product', entityId: id, details: { name: product.name, slot, bytes: req.file.size } });
  res.status(201).json(await loadProduct(id));
});

router.delete('/products/:id/images/:slot', write, async (req, res) => {
  const id = idParam(req);
  const slot = Number(req.params.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 3) throw notFound('Photo not found');
  const [[row]] = await pool.query('SELECT id, image_key FROM product_images WHERE product_id = ? AND slot = ?', [id, slot]);
  if (!row) throw notFound('Photo not found');
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM product_images WHERE id = ?', [row.id]);
    if (slot === 1) await conn.query('UPDATE products SET thumbnail_key = NULL WHERE id = ?', [id]);
  });
  if (isStoredImageKey(row.image_key)) await deleteFiles([row.image_key]);
  await audit({ ...actor(req), action: 'product.image_removed', entityType: 'product', entityId: id, details: { slot } });
  res.json(await loadProduct(id));
});

export default router;
