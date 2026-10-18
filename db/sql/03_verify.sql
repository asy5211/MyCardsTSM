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
--    seller_application_documents 2, audit_logs 1, payouts 0, seller_earnings 0,
--    platform_settings 2 and every new v1.3 table (orders, order_items, reviews, messages,
--    sell_tickets, sell_ticket_items, support_requests, seller_payout_methods, favorite_sellers) at 0
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
UNION ALL SELECT 'seller_earnings',              COUNT(*) FROM seller_earnings
UNION ALL SELECT 'platform_settings',            COUNT(*) FROM platform_settings
UNION ALL SELECT 'orders',                       COUNT(*) FROM orders
UNION ALL SELECT 'order_items',                  COUNT(*) FROM order_items
UNION ALL SELECT 'reviews',                      COUNT(*) FROM reviews
UNION ALL SELECT 'messages',                     COUNT(*) FROM messages
UNION ALL SELECT 'sell_tickets',                 COUNT(*) FROM sell_tickets
UNION ALL SELECT 'sell_ticket_items',            COUNT(*) FROM sell_ticket_items
UNION ALL SELECT 'support_requests',             COUNT(*) FROM support_requests
UNION ALL SELECT 'seller_payout_methods',        COUNT(*) FROM seller_payout_methods
UNION ALL SELECT 'favorite_sellers',             COUNT(*) FROM favorite_sellers;

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

-- 11) Schema v1.4 is complete. Expect tables = 25 and views = 1.
SELECT SUM(table_type = 'BASE TABLE') AS tables_found, SUM(table_type = 'VIEW') AS views_found
FROM information_schema.tables WHERE table_schema = DATABASE();

-- 12) TSM's fee and the payment (Apple / card) fee, in basis points (100 = 1%). Expect
--     tsm_fee_bps = 500 (a flat 5%) and processing_fee_bps = 0 until an admin sets the real rate
--     under Fees in the admin site.
SELECT setting_key, value_int FROM platform_settings ORDER BY setting_key;

-- 13) Sellers by standing. 'revoked' means selling was removed but the account was left alone.
SELECT status, COUNT(*) AS sellers FROM seller_profiles GROUP BY status;

-- 14) Support requests by who answers them (v1.4). 'seller' = routed to the seller's dashboard,
--     'tsm' = guests, requests with no seller, and ones TSM staff took over. All counts start at 0.
SELECT handler, COUNT(*) AS requests, SUM(seller_id IS NOT NULL) AS routed_to_a_seller
FROM support_requests GROUP BY handler;

-- 15) TSM's own storefront (v1.4). Expect 0 rows until an admin posts the first featured listing, then exactly 1.
SELECT sp.user_id, sp.display_name, COUNT(l.id) AS featured_listings
FROM seller_profiles sp LEFT JOIN listings l ON l.seller_id = sp.user_id
WHERE sp.is_house = 1 GROUP BY sp.user_id, sp.display_name;

-- 16) Every sale keeps the fee rates it was made at, so changing a rate later never rewrites old sales.
--     Both numbers should be 0: sales whose stored fees do not add up to gross - net.
SELECT SUM(commission_cents + processing_fee_cents + net_cents <> gross_cents) AS sales_with_wrong_split,
       SUM(commission_cents <> ROUND(gross_cents * commission_bps / 10000)) AS commission_not_at_its_own_rate
FROM seller_earnings;
