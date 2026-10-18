// The sold-out rule from the spec, exercised against live data.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db.js';
import { startServer } from './helpers.js';

describe('sold-out rule (spec 5.4)', () => {
  let t;
  let productId;
  before(async () => {
    t = await startServer();
    const list = await t.api('/api/products?q=collector%20set');
    productId = list.json.items[0].id;
  });
  after(() => t.stop());

  it('a seller who runs out disappears from the offer list; the product stays', async () => {
    await pool.query(
      `UPDATE listings l JOIN seller_profiles sp ON sp.user_id = l.seller_id
          SET l.quantity_available = 0
        WHERE l.product_id = ? AND sp.display_name = 'TopTier Collectibles'`,
      [productId],
    );
    const r = await t.api(`/api/products/${productId}`);
    assert.equal(r.json.sellerCount, 3);
    assert.equal(r.json.isFullySoldOut, false);
    assert.equal(r.json.lowestPriceCents, 12799);
    assert.equal(r.json.listings.some((l) => l.seller.displayName === 'TopTier Collectibles'), false);
  });

  it('when every seller is out the product grays out as sold out', async () => {
    await pool.query('UPDATE listings SET quantity_available = 0 WHERE product_id = ?', [productId]);
    const detail = await t.api(`/api/products/${productId}`);
    assert.equal(detail.json.isFullySoldOut, true);
    assert.deepEqual(detail.json.listings, []);
    const list = await t.api('/api/products?q=collector%20set');
    assert.equal(list.json.items[0].isFullySoldOut, true);
    assert.equal(list.json.items[0].lowestPriceCents, null);
  });

  it('restocking brings the product back', async () => {
    await pool.query('UPDATE listings SET quantity_available = 2 WHERE product_id = ? LIMIT 1', [productId]);
    const detail = await t.api(`/api/products/${productId}`);
    assert.equal(detail.json.isFullySoldOut, false);
    assert.equal(detail.json.listings.length, 1);
  });

  it('a removed (inactive) listing is hidden even if it has stock', async () => {
    await pool.query('UPDATE listings SET quantity_available = 5, is_active = 0 WHERE product_id = ?', [productId]);
    const detail = await t.api(`/api/products/${productId}`);
    assert.equal(detail.json.listings.length, 0);
    // No active listings at all: not "sold out", just nothing on sale.
    assert.equal(detail.json.isFullySoldOut, false);
  });
});
