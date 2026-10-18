// Product photos. Unlike seller-application documents (private), these are public: the admin
// site uploads them here and the mobile app downloads them from /media/products/...
// The type is decided by the file's first bytes, never by its name or claimed type.
import { randomUUID } from 'node:crypto';

/** Returns { mime, ext } for JPEG / PNG / WebP, or null for anything else. */
export function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

/** A fresh random storage key such as "products/<product id>/<uuid>.jpg". */
export function productImageKey(productId, ext) {
  return `products/${productId}/${randomUUID()}.${ext}`;
}

/** Keys written by uploads start with "products/". The older demo keys ("collector_set_alpha_1") are not files. */
export const isStoredImageKey = (key) => typeof key === 'string' && key.startsWith('products/');

/** The path the app/admin site loads the picture from (relative to the server), or null if there is no real file. */
export const mediaPath = (key) => (isStoredImageKey(key) ? `/media/${key}` : null);

/**
 * SQL for "this product is ready for sellers": it is active, has a description, and has its main photo.
 * Written for a products table aliased as p.
 */
export const PRODUCT_READY_SQL = `p.is_active = 1 AND p.description IS NOT NULL AND CHAR_LENGTH(TRIM(p.description)) >= 10
  AND EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id AND i.slot = 1 AND i.image_key LIKE 'products/%')`;
