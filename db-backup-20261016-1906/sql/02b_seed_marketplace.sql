-- ============================================================================
-- TSM (The Sealed Market) - 02b_seed_marketplace.sql   (DEV-ONLY demo data, v1.2)
--
-- Run AFTER 02_seed.sql (fresh install), or on its own on a database you already
-- have after migration 002. Safe to run more than once: it only fills in blanks
-- and uses INSERT IGNORE with fixed ids.
--
--   1. Gives the 91 demo offers a distributor and "sourced from" so the app shows
--      real-looking transparency details instead of blanks.
--   2. Adds a few demo sales, a paid payout and a pending payout so the payouts
--      screens in the admin site have something to show.
--
-- Never run this against real data.
-- ============================================================================

USE tsm;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Distributor + sourced-from for demo offers (the same three names the app's sample data uses).
UPDATE listings
   SET distributor = ELT(1 + MOD(CRC32(seller_id), 3), 'Acme Wholesale', 'Card Depot', 'Manufacturer Direct'),
       source_type = ELT(1 + MOD(CRC32(seller_id), 3), 'distributor', 'distributor', 'manufacturer_direct')
 WHERE distributor IS NULL;

-- Fill in box_number / boxes_in_case from "Box 4 of 12" for offers that don't have them yet.
UPDATE listings
   SET box_number    = CAST(REGEXP_SUBSTR(box_position, '[0-9]+') AS UNSIGNED),
       boxes_in_case = CAST(REGEXP_SUBSTR(box_position, '[0-9]+$') AS UNSIGNED)
 WHERE box_number IS NULL
   AND box_position REGEXP '^Box [0-9]+ of [0-9]+$';

-- 2. Demo sales for the demo seller (seller@tsm.test) and two other sellers.
SET @seller := (SELECT id FROM users WHERE email = 'seller@tsm.test');
SET @hub    := (SELECT id FROM users WHERE email = 'hub@tsm.test');
SET @elite  := (SELECT id FROM users WHERE email = 'elite@tsm.test');
SET @staff  := (SELECT id FROM admin_staff WHERE email = 'admin@tsm.test');

INSERT IGNORE INTO payouts (id, seller_id, amount_cents, earnings_count, status, reference, note, created_by_staff_id, created_at, paid_at, paid_by_staff_id) VALUES
  ('a0b10001-0000-4000-8000-000000000001', @seller, 24248, 1, 'paid',    'DEMO-ACH-1001', 'Demo payout',  @staff, '2026-09-30 15:00:00.000', '2026-10-01 14:00:00.000', @staff),
  ('a0b10001-0000-4000-8000-000000000002', @seller, 15519, 1, 'pending', NULL,            'Demo pending', @staff, '2026-10-12 15:00:00.000', NULL, NULL);

-- commission 3.00% (300 bps), rounded to the nearest cent: net = gross - commission
INSERT IGNORE INTO seller_earnings (id, seller_id, listing_id, product_name, order_ref, quantity, unit_price_cents, gross_cents, commission_bps, commission_cents, net_cents, status, payout_id, created_at) VALUES
  ('e0a10001-0000-4000-8000-000000000001', @seller, NULL, 'Collector Set Alpha',        'ORD-30001', 2, 12499, 24998, 300, 750, 24248, 'paid',      'a0b10001-0000-4000-8000-000000000001', '2026-09-26 18:20:00.000'),
  ('e0a10001-0000-4000-8000-000000000002', @seller, NULL, 'Crimson Storm Booster Box',  'ORD-30007', 1, 14999, 14999, 300, 450, 14549, 'available', NULL,                                   '2026-10-08 16:05:00.000'),
  ('e0a10001-0000-4000-8000-000000000003', @seller, NULL, 'Standard Pack',              'ORD-30012', 3,   499,  1497, 300,  45,  1452, 'available', NULL,                                   '2026-10-09 11:40:00.000'),
  ('e0a10001-0000-4000-8000-000000000004', @seller, NULL, 'Mega Evolution Blister',     'ORD-30015', 1, 15999, 15999, 300, 480, 15519, 'in_payout', 'a0b10001-0000-4000-8000-000000000002', '2026-10-11 20:15:00.000'),
  ('e0a10001-0000-4000-8000-000000000005', @hub,    NULL, 'Collector Set Alpha',        'ORD-30003', 1, 13499, 13499, 300, 405, 13094, 'available', NULL,                                   '2026-10-02 13:30:00.000'),
  ('e0a10001-0000-4000-8000-000000000006', @elite,  NULL, 'Crimson Storm Booster Box',  'ORD-30009', 2, 13999, 27998, 300, 840, 27158, 'available', NULL,                                   '2026-10-10 09:10:00.000');
