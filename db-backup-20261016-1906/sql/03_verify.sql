-- ============================================================================
-- TSM (The Sealed Market) - 03_verify.sql
-- Read-only sanity checks. Run after 01_schema.sql + 02_seed.sql
-- (+ 02b_seed_marketplace.sql if you want the marketplace demo data).
-- In Workbench, run the whole file; each SELECT opens its own result tab.
-- ============================================================================

USE tsm;

-- 1) Row counts. Expected with the stock seed:
--    users 8, admin_staff 1, seller_profiles 6, brands 12, product_types 6,
--    products 29, product_images 30, listings 91, seller_applications 2,
--    seller_application_documents 2, audit_logs 1, payouts 0, seller_earnings 0
--    (with 02b: payouts 2, seller_earnings 6)
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'admin_staff',                  COUNT(*) FROM admin_staff
UNION ALL SELECT 'seller_profiles',              COUNT(*) FROM seller_profiles
UNION ALL SELECT 'brands',                       COUNT(*) FROM brands
UNION ALL SELECT 'product_types',                COUNT(*) FROM product_types
UNION ALL SELECT 'products',                     COUNT(*) FROM products
UNION ALL SELECT 'product_images',               COUNT(*) FROM product_images
UNION ALL SELECT 'listings',                     COUNT(*) FROM listings
UNION ALL SELECT 'seller_applications',          COUNT(*) FROM seller_applications
UNION ALL SELECT 'seller_application_documents', COUNT(*) FROM seller_application_documents
UNION ALL SELECT 'audit_logs',                   COUNT(*) FROM audit_logs
UNION ALL SELECT 'payouts',                      COUNT(*) FROM payouts
UNION ALL SELECT 'seller_earnings',              COUNT(*) FROM seller_earnings;

-- 2) Products per brand (matches the Home "shop by brand" grid). Expect 12 rows.
SELECT b.name AS brand, COUNT(p.id) AS products
FROM brands b LEFT JOIN products p ON p.brand_id = b.id
GROUP BY b.id, b.name, b.sort_order
ORDER BY b.sort_order;

-- 3) The shop grid query: lowest price + number of sellers per product.
--    Expect exactly ONE row with is_fully_sold_out = 1: "Elite Series" (Magic).
SELECT brand, product_name, product_type, lowest_price, seller_count, is_fully_sold_out
FROM v_product_summary
ORDER BY brand, product_name;

-- 4) The product detail query: one product's offers, cheapest first, sold-out
--    sellers hidden (spec 5.4). Collector Set Alpha should show 4 sellers, with
--    Demo Seller (the app's gold "You" row) in the middle by price.
SELECT sp.display_name AS seller, l.price, l.source, l.box_position, l.condition_label, l.quantity_available
FROM listings l
JOIN products p        ON p.id = l.product_id
JOIN seller_profiles sp ON sp.user_id = l.seller_id
WHERE p.name = 'Collector Set Alpha'
  AND l.is_active = 1 AND l.quantity_available > 0
ORDER BY l.price ASC;

-- 5) Case/accent-insensitive brand match (the app's Product.belongs(to:) rule).
--    Expect 4 rows (Pokémon products) even though we search without the accent.
SELECT p.name FROM products p JOIN brands b ON b.id = p.brand_id WHERE b.name = 'Pokemon';

-- 6) Seller applications waiting for admin review. Expect 1: Lone Star Cards LLC.
SELECT a.id, a.business_name, a.status, u.email AS applicant, COUNT(d.id) AS documents
FROM seller_applications a
JOIN users u ON u.id = a.user_id
LEFT JOIN seller_application_documents d ON d.application_id = a.id
WHERE a.status IN ('submitted','under_review')
GROUP BY a.id, a.business_name, a.status, u.email;

-- 7) "One open application per user" guard. This should FAIL with a duplicate-key
--    error on uq_one_open_application (leave commented unless you want to test it):
-- INSERT INTO seller_applications (id, user_id, business_name, business_address, contact_email, source_type, distributor_list)
-- SELECT UUID(), user_id, 'Second try', 'x', 'x@tsm.test', 'other', 'x' FROM seller_applications WHERE status = 'submitted' LIMIT 1;

-- 8) Marketplace transparency fields. Every offer should say where it was sourced from;
--    box numbers only exist on offers taken from a case. Both counts should be 0.
SELECT SUM(source_type IS NULL)                                    AS offers_without_source_type,
       SUM(source = 'Loose Product' AND box_number IS NOT NULL)    AS loose_offers_with_a_box_number
FROM listings;

-- 9) Offers the shop will show right now (active, not held by admin, seller not suspended, in stock).
SELECT COUNT(*) AS live_offers
FROM listings l JOIN seller_profiles sp ON sp.user_id = l.seller_id
WHERE l.is_active = 1 AND l.admin_hold = 0 AND sp.status = 'active' AND l.quantity_available > 0;

-- 10) Money ledger adds up: available + in_payout + paid + reversed = every sale's net.
SELECT status, COUNT(*) AS sales, SUM(net_cents) AS net_cents FROM seller_earnings GROUP BY status;
