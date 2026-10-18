// DEV ONLY. Gives the demo products a picture and a description so sellers can pick them
// (a product is only "ready" for sellers once staff have added both) and the app has images to show.
//
//   npm run demo:content
//
// Pictures come from ../db/demo-images (one JPEG per demo image key). Products that already have a
// real uploaded photo or a description are left alone, so it is safe to run more than once.
// Never run this against real data. Replace the pictures from the admin site any time.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { closePool, pool } from '../src/db.js';
import { productImageKey, sniffImage } from '../src/lib/media.js';
import { saveFile } from '../src/lib/uploads.js';

const here = dirname(fileURLToPath(import.meta.url));
const imagesDir = resolve(process.env.DEMO_IMAGES_DIR ?? join(here, '..', '..', 'db', 'demo-images'));

const BLURB = {
  'Booster Boxes': 'A factory-sealed booster display box.',
  'Sealed Cases': 'A factory-sealed case, just as it left the manufacturer.',
  'Single Packs': 'A single factory-sealed booster pack.',
  Blisters: 'A factory-sealed blister pack with bonus contents.',
  'Illustration Boxes': 'A factory-sealed illustration box with collector extras.',
  Other: 'A factory-sealed collectible product.',
};

async function main() {
  const dbName = decodeURIComponent(new URL(config.databaseUrl).pathname.slice(1));
  console.log(`Adding demo pictures and descriptions to "${dbName}" (pictures from ${imagesDir})`);

  let pictures = 0;
  let missing = 0;
  const [images] = await pool.query(
    `SELECT i.id, i.product_id, i.slot, i.image_key FROM product_images i WHERE i.image_key NOT LIKE 'products/%'`);
  for (const row of images) {
    const file = join(imagesDir, `${row.image_key}.jpg`);
    if (!existsSync(file)) { missing += 1; continue; }
    const buffer = await readFile(file);
    const type = sniffImage(buffer);
    if (!type) { missing += 1; continue; }
    const key = productImageKey(row.product_id, type.ext);
    await saveFile(key, buffer);
    await pool.query('UPDATE product_images SET image_key = ? WHERE id = ?', [key, row.id]);
    if (row.slot === 1) await pool.query('UPDATE products SET thumbnail_key = ? WHERE id = ?', [key, row.product_id]);
    pictures += 1;
  }

  // A product whose only trace of a picture is an old demo thumbnail key and no photo row at all.
  const [loose] = await pool.query(
    `SELECT p.id, p.thumbnail_key FROM products p
      WHERE p.thumbnail_key IS NOT NULL AND p.thumbnail_key NOT LIKE 'products/%'
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id AND i.slot = 1)`);
  for (const row of loose) {
    const file = join(imagesDir, `${row.thumbnail_key}.jpg`);
    if (!existsSync(file)) continue;
    const buffer = await readFile(file);
    const type = sniffImage(buffer);
    if (!type) continue;
    const key = productImageKey(row.id, type.ext);
    await saveFile(key, buffer);
    await pool.query('INSERT INTO product_images (id, product_id, slot, image_key) VALUES (?, ?, 1, ?)', [randomUUID(), row.id, key]);
    await pool.query('UPDATE products SET thumbnail_key = ? WHERE id = ?', [key, row.id]);
    pictures += 1;
  }

  let described = 0;
  const [bare] = await pool.query(
    `SELECT p.id, p.name, b.name AS brand, pt.name AS type FROM products p
       JOIN brands b ON b.id = p.brand_id JOIN product_types pt ON pt.id = p.product_type_id
      WHERE p.description IS NULL OR CHAR_LENGTH(TRIM(p.description)) < 10`);
  for (const p of bare) {
    const text = `${p.name} from ${p.brand}. ${BLURB[p.type] ?? BLURB.Other} Every offer on TSM shows who is selling it, where it was sourced from, and which box of the case it came from, so you can see exactly what you are buying.`;
    await pool.query('UPDATE products SET description = ? WHERE id = ?', [text, p.id]);
    described += 1;
  }

  const [[ready]] = await pool.query(
    `SELECT COUNT(*) AS n FROM products p WHERE p.is_active = 1 AND p.description IS NOT NULL AND CHAR_LENGTH(TRIM(p.description)) >= 10
        AND EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id AND i.slot = 1 AND i.image_key LIKE 'products/%')`);
  console.log(`Done: ${pictures} picture(s) added, ${described} description(s) written, ${ready.n} product(s) now ready for sellers.`);
  if (missing) console.log(`(${missing} picture(s) had no matching file in the demo-images folder.)`);
}

try {
  await main();
} finally {
  await closePool();
}
