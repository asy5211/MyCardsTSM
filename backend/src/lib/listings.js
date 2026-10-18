// What a seller's offer ("listing") is made of, and how it is checked.
// A seller picks a product that TSM staff created, then fills in the transparency details:
// price, how many are in stock, where it was sourced from, who the distributor is, and
// whether it is a box taken from a sealed case ("Box 4 of 12") or loose product.
import { z } from 'zod';
import { mediaPath } from './media.js';
import { fromCents, toCents } from './money.js';
import { UUID_RE } from './validate.js';

export const SOURCE_TYPES = ['distributor', 'retail_store', 'manufacturer_direct', 'other'];
export const SOURCE_LABELS = {
  distributor: 'Authorized distributor',
  retail_store: 'Retail store',
  manufacturer_direct: 'Direct from manufacturer',
  other: 'Other source',
};
export const PACKAGING = ['case', 'loose'];
export const MAX_PRICE_CENTS = 10_000_000; // $100,000.00
export const MAX_QUANTITY = 100_000;

export const listingBase = z.object({
  priceCents: z
    .number({ error: 'Enter a price' })
    .int('Price must be a whole number of cents')
    .min(1, 'Price must be at least $0.01')
    .max(MAX_PRICE_CENTS, 'Price is too high'),
  quantityAvailable: z
    .number({ error: 'Enter how many you have in stock' })
    .int('Stock must be a whole number')
    .min(0, 'Stock cannot be negative')
    .max(MAX_QUANTITY, 'Stock is too high'),
  sourceType: z.enum(SOURCE_TYPES, { error: 'Choose where this product was sourced from' }),
  distributor: z
    .string({ error: 'Enter the distributor or supplier' })
    .trim()
    .min(2, 'Enter the distributor or supplier name')
    .max(120, 'Keep the distributor name under 120 characters'),
  packaging: z.enum(PACKAGING, { error: 'Choose "From a case" or "Loose product"' }),
  boxNumber: z.number().int('Box number must be a whole number').min(1, 'Box number starts at 1').max(999).nullish(),
  boxesInCase: z.number().int('Boxes in the case must be a whole number').min(1, 'A case has at least 1 box').max(999).nullish(),
});

/** A box from a case must say which box, out of how many. */
function checkCase(v, ctx) {
  if (v.packaging !== 'case') return;
  if (v.boxNumber == null) {
    ctx.addIssue({ code: 'custom', path: ['boxNumber'], message: 'Enter which box in the case this is' });
  }
  if (v.boxesInCase == null) {
    ctx.addIssue({ code: 'custom', path: ['boxesInCase'], message: 'Enter how many boxes are in the case' });
  }
  if (v.boxNumber != null && v.boxesInCase != null && v.boxNumber > v.boxesInCase) {
    ctx.addIssue({ code: 'custom', path: ['boxNumber'], message: 'The box number cannot be higher than the boxes in the case' });
  }
  // Each unit sold hands over the next box, so a case cannot supply more units than it has boxes left.
  if (v.boxNumber != null && v.boxesInCase != null && v.boxNumber <= v.boxesInCase && typeof v.quantityAvailable === 'number') {
    const left = v.boxesInCase - v.boxNumber + 1;
    if (v.quantityAvailable > left) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantityAvailable'],
        message: `Only ${left} ${left === 1 ? 'box is' : 'boxes are'} left in the case from box ${v.boxNumber} of ${v.boxesInCase}, so stock cannot be higher than ${left}`,
      });
    }
  }
}

/** The editable fields of an offer, checked as a whole (used for create, and for the merged result of an edit). */
export const listingFields = listingBase.superRefine(checkCase);

export const createListingBody = listingBase
  .extend({ productId: z.string({ error: 'Choose a product' }).regex(UUID_RE, 'Choose a product') })
  .superRefine(checkCase);

/** Any subset of the fields plus the on/off switch; the merged result is re-checked with listingFields. */
export const patchListingBody = listingBase
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });

/** Turns the checked fields into the column values the table stores. */
export function listingColumns(v) {
  const isCase = v.packaging === 'case';
  return {
    price: fromCents(v.priceCents),
    quantity_available: v.quantityAvailable,
    source_type: v.sourceType,
    distributor: v.distributor,
    source: isCase ? 'From Case' : 'Loose Product',
    box_number: isCase ? v.boxNumber : null,
    boxes_in_case: isCase ? v.boxesInCase : null,
    box_position: isCase ? `Box ${v.boxNumber} of ${v.boxesInCase}` : null,
  };
}

/** A table row (SELECT l.*, sp.status AS seller_status ...) as the JSON the admin site uses. */
export function listingDto(row) {
  const isCase = row.source === 'From Case';
  const adminHold = Boolean(row.admin_hold);
  const isActive = Boolean(row.is_active);
  let status = 'live';
  if (adminHold) status = 'on_hold';
  else if (!isActive) status = 'paused';
  else if (row.seller_status === 'suspended') status = 'seller_suspended';
  else if (row.seller_status === 'revoked') status = 'seller_revoked';
  else if (row.quantity_available <= 0) status = 'sold_out';
  return {
    id: row.id,
    productId: row.product_id,
    sellerId: row.seller_id,
    priceCents: toCents(row.price),
    quantityAvailable: Number(row.quantity_available),
    sourceType: row.source_type,
    sourceLabel: SOURCE_LABELS[row.source_type] ?? row.source_type,
    distributor: row.distributor ?? null,
    packaging: isCase ? 'case' : 'loose',
    source: row.source,
    boxPosition: row.box_position ?? null,
    boxNumber: row.box_number ?? null,
    boxesInCase: row.boxes_in_case ?? null,
    condition: row.condition_label,
    isActive,
    adminHold,
    adminHoldReason: row.admin_hold_reason ?? null,
    // TSM's own listings are "featured": they sit at the top of the product page whatever they cost.
    isFeatured: Boolean(row.is_house),
    status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/** One offer joined to its seller and product (the shape both the staff and the seller screens list). */
export const LISTING_SELECT = `
  SELECT l.*, sp.display_name, sp.status AS seller_status, sp.is_house, p.name AS product_name, b.name AS brand_name, p.thumbnail_key
    FROM listings l
    JOIN seller_profiles sp ON sp.user_id = l.seller_id
    JOIN products p ON p.id = l.product_id
    JOIN brands b ON b.id = p.brand_id`;

export function fullListingDto(r) {
  return {
    ...listingDto(r),
    sellerName: r.display_name,
    productName: r.product_name,
    brandName: r.brand_name,
    thumbnailUrl: mediaPath(r.thumbnail_key),
  };
}
