// Creating, changing and finding offers (listings). A seller does this for their own offers in the seller portal; an admin
// does exactly the same for TSM's featured offers. Both go through these functions so the two can never drift apart.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { audit } from './audit.js';
import {
  LISTING_SELECT,
  fullListingDto,
  listingBase,
  listingColumns,
  listingFields,
} from './listings.js';
import { PRODUCT_READY_SQL, mediaPath } from './media.js';
import { dir } from './sort.js';
import { UUID_RE } from './validate.js';

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);
const fieldError = (field, message) => new HttpError(400, 'validation_error', 'Some fields are invalid', [{ field, message }]);

/** The status filters of an offers list: fixed SQL fragments, never user text. */
export const LISTING_STATUS_SQL = {
  live: 'l.is_active = 1 AND l.admin_hold = 0 AND l.quantity_available > 0',
  paused: 'l.admin_hold = 0 AND l.is_active = 0',
  on_hold: 'l.admin_hold = 1',
  sold_out: 'l.admin_hold = 0 AND l.is_active = 1 AND l.quantity_available = 0',
};

/**
 * A seller's own offers, filtered and sorted. f: status, brandId, typeId, q, sort ('name' | 'newest' | 'oldest'), limit, offset.
 * Used by the seller portal (their offers) and by the admin site (TSM's featured offers).
 */
export async function listListingsFor(sellerId, f) {
  const where = ['l.seller_id = ?'];
  const params = [sellerId];
  if (f.status && f.status !== 'all') where.push(`(${LISTING_STATUS_SQL[f.status]})`);
  if (f.brandId) { where.push('p.brand_id = ?'); params.push(f.brandId); }
  if (f.typeId) { where.push('p.product_type_id = ?'); params.push(f.typeId); }
  if (f.q) {
    where.push('(p.name LIKE ? OR b.name LIKE ? OR l.distributor LIKE ?)');
    const like = `%${escapeLike(f.q)}%`;
    params.push(like, like, like);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM listings l JOIN products p ON p.id = l.product_id JOIN brands b ON b.id = p.brand_id ${whereSql}`,
    params,
  );
  const order = f.sort === 'name' ? 'b.name, p.name, l.created_at' : `l.created_at ${dir(f.sort ?? 'newest')}, l.id ${dir(f.sort ?? 'newest')}`;
  const [rows] = await pool.query(`${LISTING_SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  return { items: rows.map(fullListingDto), total: Number(total), limit: f.limit, offset: f.offset };
}

/** One offer that belongs to `sellerId`, joined to its product (or a 404). */
export async function loadListingOf(id, sellerId) {
  if (!UUID_RE.test(id)) throw notFound('Offer not found');
  const [[row]] = await pool.query(`${LISTING_SELECT} WHERE l.id = ? AND l.seller_id = ?`, [id, sellerId]);
  if (!row) throw notFound('Offer not found');
  return row;
}

/**
 * Adds an offer for `sellerId`. `body` has already been checked with createListingBody.
 * `actor` is the audit actor ({ actorType, actorId, ip }).
 */
export async function createListingFor(sellerId, body, actor) {
  // Only products staff created AND finished (description + main photo) can be offered.
  const [[product]] = await pool.query(`SELECT p.id, p.name FROM products p WHERE p.id = ? AND ${PRODUCT_READY_SQL}`, [body.productId]);
  if (!product) throw fieldError('productId', 'That product is not available to sell. Pick one from the TSM catalog.');

  const cols = listingColumns(body);
  const id = randomUUID();
  await pool.query(
    `INSERT INTO listings (id, product_id, seller_id, price, source, box_position, box_number, boxes_in_case,
                           source_type, distributor, quantity_available, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, body.productId, sellerId, cols.price, cols.source, cols.box_position, cols.box_number, cols.boxes_in_case,
     cols.source_type, cols.distributor, cols.quantity_available],
  );
  await audit({
    ...actor, action: 'listing.created', entityType: 'listing', entityId: id,
    details: {
      product: product.name, priceCents: body.priceCents, quantity: body.quantityAvailable,
      sourceType: body.sourceType, distributor: body.distributor, boxPosition: cols.box_position,
    },
  });
  return id;
}

/**
 * Applies a change to an existing offer. `row` is the stored offer (from loadListingOf), `patch` was checked with patchListingBody.
 * A seller cannot resume an offer TSM put on hold; pass { ignoreHold: true } when staff are the ones changing it.
 */
export async function updateListingFor(row, patch, actor, { ignoreHold = false } = {}) {
  const before = fullListingDto(row);

  // Merge the change into what is stored, then check the whole offer again.
  const merged = {
    priceCents: patch.priceCents ?? before.priceCents,
    quantityAvailable: patch.quantityAvailable ?? before.quantityAvailable,
    sourceType: patch.sourceType ?? before.sourceType,
    distributor: patch.distributor ?? before.distributor ?? '',
    packaging: patch.packaging ?? before.packaging,
    boxNumber: patch.packaging === 'loose' ? null : (patch.boxNumber ?? before.boxNumber),
    boxesInCase: patch.packaging === 'loose' ? null : (patch.boxesInCase ?? before.boxesInCase),
  };
  const touchesCase = ['packaging', 'boxNumber', 'boxesInCase'].some((k) => k in patch);
  // Older offers say "From Case" without a box number, or list more stock than the case has boxes left;
  // a price change (or pausing) must not be blocked by that. Changing stock or the case details re-checks everything.
  const touchesStock = 'quantityAvailable' in patch;
  const overStocked = before.boxNumber != null && before.boxesInCase != null && before.quantityAvailable > before.boxesInCase - before.boxNumber + 1;
  const legacyCase = before.packaging === 'case' && !touchesCase && !touchesStock && (before.boxNumber == null || overStocked);
  const checked = (legacyCase ? listingBase : listingFields).parse(merged);

  let isActive = row.is_active;
  if (patch.isActive !== undefined) {
    if (patch.isActive && row.admin_hold && !ignoreHold) {
      throw new HttpError(403, 'forbidden', `TSM put this offer on hold: ${row.admin_hold_reason ?? 'contact support'}`);
    }
    isActive = patch.isActive ? 1 : 0;
  }
  const cols = listingColumns(checked);
  await pool.query(
    `UPDATE listings SET price = ?, quantity_available = ?, source_type = ?, distributor = ?, source = ?,
            box_position = ?, box_number = ?, boxes_in_case = ?, is_active = ? WHERE id = ?`,
    [cols.price, cols.quantity_available, cols.source_type, cols.distributor,
     legacyCase ? row.source : cols.source,
     legacyCase ? row.box_position : cols.box_position,
     legacyCase ? row.box_number : cols.box_number,
     legacyCase ? row.boxes_in_case : cols.boxes_in_case,
     isActive, row.id],
  );
  const changes = {};
  if (checked.priceCents !== before.priceCents) changes.priceCents = [before.priceCents, checked.priceCents];
  if (checked.quantityAvailable !== before.quantityAvailable) changes.quantity = [before.quantityAvailable, checked.quantityAvailable];
  if (checked.sourceType !== before.sourceType) changes.sourceType = [before.sourceType, checked.sourceType];
  if (checked.distributor !== before.distributor) changes.distributor = [before.distributor, checked.distributor];
  if (cols.box_position !== before.boxPosition && !legacyCase) changes.boxPosition = [before.boxPosition, cols.box_position];
  let action = 'listing.updated';
  if (patch.isActive !== undefined && Boolean(isActive) !== before.isActive) action = isActive ? 'listing.resumed' : 'listing.paused';
  await audit({ ...actor, action, entityType: 'listing', entityId: row.id, details: { product: row.product_name, changes } });
}

/**
 * The products that are ready to be offered (staff finished them), for the "pick a product" step.
 * With `sellerId`, each row also says how many offers that seller already has on it.
 */
export async function readyProducts({ q, brandId, typeId, limit, offset }, sellerId) {
  const where = [PRODUCT_READY_SQL];
  const params = [];
  if (q) {
    where.push('(p.name LIKE ? OR b.name LIKE ?)');
    params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`);
  }
  if (brandId) { where.push('p.brand_id = ?'); params.push(brandId); }
  if (typeId) { where.push('p.product_type_id = ?'); params.push(typeId); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const from = 'FROM products p JOIN brands b ON b.id = p.brand_id JOIN product_types pt ON pt.id = p.product_type_id';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.description, p.thumbnail_key, b.id AS brand_id, b.name AS brand_name, pt.id AS type_id, pt.name AS type_name,
            (SELECT COUNT(*) FROM listings l WHERE l.product_id = p.id AND l.seller_id = ?) AS my_listing_count
       ${from} ${whereSql} ORDER BY b.name, p.name LIMIT ? OFFSET ?`,
    [sellerId, ...params, limit, offset],
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      brand: { id: r.brand_id, name: r.brand_name },
      type: { id: r.type_id, name: r.type_name },
      thumbnailUrl: mediaPath(r.thumbnail_key),
      myListingCount: Number(r.my_listing_count),
    })),
    total: Number(total),
    limit,
    offset,
  };
}
