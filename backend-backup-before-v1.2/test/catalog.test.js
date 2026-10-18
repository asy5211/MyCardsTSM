import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startServer } from './helpers.js';

describe('catalog', () => {
  let t;
  before(async () => {
    t = await startServer();
  });
  after(() => t.stop());

  it('GET /health reports the database is up', async () => {
    const r = await t.api('/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'ok');
    assert.equal(r.json.db, 'up');
  });

  it('unknown routes return the standard error shape', async () => {
    const r = await t.api('/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.json.error.code, 'not_found');
  });

  it('lists the 12 brands in shop-grid order', async () => {
    const r = await t.api('/api/brands');
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 12);
    assert.equal(r.json[0].name, 'Pokémon');
    assert.equal(r.json[11].name, 'Upper Deck');
  });

  it('lists the 6 product types', async () => {
    const r = await t.api('/api/product-types');
    assert.deepEqual(
      r.json.map((x) => x.name),
      ['Sealed Cases', 'Booster Boxes', 'Blisters', 'Single Packs', 'Illustration Boxes', 'Other'],
    );
  });

  it('returns all 29 products by default', async () => {
    const r = await t.api('/api/products?limit=100');
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 29);
    assert.equal(r.json.items.length, 29);
  });

  it('paginates', async () => {
    const r = await t.api('/api/products?limit=10&offset=25');
    assert.equal(r.json.items.length, 4);
    assert.equal(r.json.total, 29);
  });

  it('filters by brand and ignores accents/case ("pokemon" finds Pokémon)', async () => {
    const r = await t.api('/api/products?brand=pokemon');
    assert.equal(r.json.total, 4);
    assert.ok(r.json.items.every((p) => p.brand === 'Pokémon'));
  });

  it('filters by product type', async () => {
    const r = await t.api(`/api/products?type=${encodeURIComponent('Sealed Cases')}`);
    assert.ok(r.json.total > 0);
    assert.ok(r.json.items.every((p) => p.type === 'Sealed Cases'));
  });

  it('searches product and brand names, treating % and _ as plain characters', async () => {
    const hobby = await t.api('/api/products?q=hobby');
    assert.deepEqual(
      hobby.json.items.map((p) => p.name),
      ['Chrome Hobby Box', 'Prizm Hobby Box', 'Series 1 Hobby Box'],
    );
    const byBrand = await t.api('/api/products?q=lorcana');
    assert.equal(byBrand.json.total, 2);
    const wildcard = await t.api(`/api/products?q=${encodeURIComponent('%')}`);
    assert.equal(wildcard.json.total, 0);
  });

  it('sorts by price ascending with sold-out products last', async () => {
    const r = await t.api('/api/products?sort=price_asc&limit=100');
    const prices = r.json.items.map((p) => p.lowestPriceCents);
    assert.equal(r.json.items[0].name, 'Hidden Leaf Pack');
    assert.equal(prices[0], 399);
    const last = r.json.items.at(-1);
    assert.equal(last.name, 'Elite Series');
    assert.equal(last.lowestPriceCents, null);
    const priced = prices.filter((p) => p !== null);
    assert.deepEqual(priced, [...priced].sort((a, b) => a - b));
  });

  it('sorts by price descending', async () => {
    const r = await t.api('/api/products?sort=price_desc');
    assert.equal(r.json.items[0].name, 'Young Guns Case');
    assert.equal(r.json.items[0].lowestPriceCents, 189999);
  });

  it('rejects bad query values with a validation error', async () => {
    const r = await t.api('/api/products?limit=1000');
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'validation_error');
    assert.equal(r.json.error.details[0].field, 'limit');
  });

  it('marks the one fully sold-out product but keeps it listed', async () => {
    const list = await t.api('/api/products?q=elite');
    const elite = list.json.items.find((p) => p.name === 'Elite Series');
    assert.equal(elite.isFullySoldOut, true);
    assert.equal(elite.sellerCount, 0);
    const detail = await t.api(`/api/products/${elite.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.json.isFullySoldOut, true);
    assert.deepEqual(detail.json.listings, []);
  });

  it('product detail lists offers cheapest first, in cents, with images', async () => {
    const list = await t.api('/api/products?q=collector%20set');
    const id = list.json.items[0].id;
    const r = await t.api(`/api/products/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.name, 'Collector Set Alpha');
    assert.equal(r.json.sellerCount, 4);
    assert.equal(r.json.lowestPriceCents, 12499);
    assert.deepEqual(r.json.listings.map((l) => l.priceCents), [12499, 12799, 12999, 13499]);
    assert.equal(r.json.listings[0].seller.displayName, 'TopTier Collectibles');
    assert.equal(r.json.listings[0].boxPosition, 'Box 4 of 12');
    assert.equal(r.json.listings[3].boxPosition, null);
    assert.equal(r.json.listings.every((l) => l.isMine === false), true);
    assert.deepEqual(r.json.images.map((i) => i.imageKey), ['collector_set_alpha_1', 'collector_set_alpha_2']);
  });

  it('pins the signed-in seller\'s own offer first (the gold row)', async () => {
    const list = await t.api('/api/products?q=collector%20set');
    const token = await t.login('seller@tsm.test');
    const r = await t.api(`/api/products/${list.json.items[0].id}`, { token });
    assert.equal(r.json.listings[0].isMine, true);
    assert.equal(r.json.listings[0].priceCents, 12799);
    assert.deepEqual(r.json.listings.slice(1).map((l) => l.priceCents), [12499, 12999, 13499]);
  });

  it('returns 404 for unknown or malformed product ids', async () => {
    const unknown = await t.api('/api/products/00000000-0000-4000-8000-000000000000');
    assert.equal(unknown.status, 404);
    const malformed = await t.api('/api/products/not-a-uuid');
    assert.equal(malformed.status, 404);
  });
});
