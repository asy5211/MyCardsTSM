-- ============================================================================
-- Migration 002 - admin site, seller listings, payouts (schema v1.2)
--
-- Run this ONCE against your real "tsm" database. It keeps all your data.
-- Safe to run twice: every step first checks whether it is already done.
--
--   Workbench: File > Open SQL Script... > this file > lightning bolt.
--   or:        mysql -u tsm_app -p < ~/School/db/sql/migrations/002_marketplace_admin.sql
--
-- What it adds
--   listings        sourced-from type, distributor, box number / boxes in the case,
--                   and an "admin hold" that lets TSM staff take an offer off the shop
--   seller_profiles when/why a seller was suspended
--   payouts, seller_earnings   what sellers have earned and been paid
--   v_product_summary          now ignores paused, held and suspended sellers' offers
-- ============================================================================

USE tsm;

DROP PROCEDURE IF EXISTS tsm_add_column;
DROP PROCEDURE IF EXISTS tsm_add_check;

DELIMITER //

CREATE PROCEDURE tsm_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) THEN
    SET @tsm_sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
    PREPARE tsm_stmt FROM @tsm_sql;
    EXECUTE tsm_stmt;
    DEALLOCATE PREPARE tsm_stmt;
  END IF;
END//

CREATE PROCEDURE tsm_add_check(IN tbl VARCHAR(64), IN cname VARCHAR(64), IN expr TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND CONSTRAINT_NAME = cname) THEN
    SET @tsm_sql = CONCAT('ALTER TABLE `', tbl, '` ADD CONSTRAINT `', cname, '` CHECK (', expr, ')');
    PREPARE tsm_stmt FROM @tsm_sql;
    EXECUTE tsm_stmt;
    DEALLOCATE PREPARE tsm_stmt;
  END IF;
END//

DELIMITER ;

-- ---- listings: transparency fields ------------------------------------------------
CALL tsm_add_column('listings', 'source_type',
  "ENUM('distributor','retail_store','manufacturer_direct','other') NOT NULL DEFAULT 'distributor' AFTER is_active");
CALL tsm_add_column('listings', 'distributor',        "VARCHAR(120) NULL AFTER source_type");
CALL tsm_add_column('listings', 'box_number',         "SMALLINT UNSIGNED NULL AFTER distributor");
CALL tsm_add_column('listings', 'boxes_in_case',      "SMALLINT UNSIGNED NULL AFTER box_number");
CALL tsm_add_column('listings', 'admin_hold',         "TINYINT(1) NOT NULL DEFAULT 0 AFTER boxes_in_case");
CALL tsm_add_column('listings', 'admin_hold_reason',  "VARCHAR(255) NULL AFTER admin_hold");

-- Offers that already say "Box 4 of 12" get their two numbers filled in.
UPDATE listings
   SET box_number    = CAST(REGEXP_SUBSTR(box_position, '[0-9]+') AS UNSIGNED),
       boxes_in_case = CAST(REGEXP_SUBSTR(box_position, '[0-9]+$') AS UNSIGNED)
 WHERE box_number IS NULL
   AND box_position REGEXP '^Box [0-9]+ of [0-9]+$';

CALL tsm_add_check('listings', 'ck_listings_box',
  'box_number IS NULL OR (boxes_in_case IS NOT NULL AND box_number BETWEEN 1 AND boxes_in_case)');

-- ---- seller_profiles: suspension details ------------------------------------------
CALL tsm_add_column('seller_profiles', 'suspended_at',     "DATETIME(3) NULL AFTER approved_by_staff_id");
CALL tsm_add_column('seller_profiles', 'suspended_reason', "VARCHAR(255) NULL AFTER suspended_at");

-- ---- payouts + earnings -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS payouts (
  id                    CHAR(36)     NOT NULL,
  seller_id             CHAR(36)     NOT NULL,
  amount_cents          INT UNSIGNED NOT NULL,
  earnings_count        INT UNSIGNED NOT NULL,
  status                ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  reference             VARCHAR(120) NULL,
  note                  VARCHAR(255) NULL,
  created_by_staff_id   CHAR(36)     NULL,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at               DATETIME(3)  NULL,
  paid_by_staff_id      CHAR(36)     NULL,
  cancelled_at          DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY ix_payouts_seller (seller_id, created_at),
  KEY ix_payouts_status (status),
  CONSTRAINT fk_payouts_seller   FOREIGN KEY (seller_id)           REFERENCES seller_profiles (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_payouts_creator  FOREIGN KEY (created_by_staff_id) REFERENCES admin_staff (id)          ON DELETE SET NULL,
  CONSTRAINT fk_payouts_payer    FOREIGN KEY (paid_by_staff_id)    REFERENCES admin_staff (id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS seller_earnings (
  id                CHAR(36)     NOT NULL,
  seller_id         CHAR(36)     NOT NULL,
  listing_id        CHAR(36)     NULL,
  product_name      VARCHAR(160) NOT NULL,
  order_ref         VARCHAR(60)  NOT NULL,
  quantity          INT UNSIGNED NOT NULL,
  unit_price_cents  INT UNSIGNED NOT NULL,
  gross_cents       INT UNSIGNED NOT NULL,
  commission_bps    SMALLINT UNSIGNED NOT NULL,
  commission_cents  INT UNSIGNED NOT NULL,
  net_cents         INT UNSIGNED NOT NULL,
  status            ENUM('available','in_payout','paid','reversed') NOT NULL DEFAULT 'available',
  payout_id         CHAR(36)     NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_earnings_seller (seller_id, status),
  KEY ix_earnings_payout (payout_id),
  CONSTRAINT fk_earnings_seller  FOREIGN KEY (seller_id)  REFERENCES seller_profiles (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_earnings_listing FOREIGN KEY (listing_id) REFERENCES listings (id)             ON DELETE SET NULL,
  CONSTRAINT fk_earnings_payout  FOREIGN KEY (payout_id)  REFERENCES payouts (id)              ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---- the shop summary now ignores paused / held / suspended offers ----------------
CREATE OR REPLACE VIEW v_product_summary AS
SELECT
  p.id    AS product_id,
  b.name  AS brand,
  pt.name AS product_type,
  p.name  AS product_name,
  MIN(CASE WHEN lv.is_live = 1 AND lv.quantity_available > 0 THEN lv.price END) AS lowest_price,
  COUNT(CASE WHEN lv.is_live = 1 AND lv.quantity_available > 0 THEN 1 END)     AS seller_count,
  CASE
    WHEN COUNT(CASE WHEN lv.is_live = 1 THEN 1 END) > 0
     AND COUNT(CASE WHEN lv.is_live = 1 AND lv.quantity_available > 0 THEN 1 END) = 0
    THEN 1 ELSE 0
  END AS is_fully_sold_out
FROM products p
JOIN brands b         ON b.id  = p.brand_id
JOIN product_types pt ON pt.id = p.product_type_id
LEFT JOIN (
  SELECT l.product_id, l.price, l.quantity_available,
         (l.is_active = 1 AND l.admin_hold = 0 AND sp.status = 'active') AS is_live
    FROM listings l
    JOIN seller_profiles sp ON sp.user_id = l.seller_id
) lv ON lv.product_id = p.id
WHERE p.is_active = 1
GROUP BY p.id, b.name, pt.name, p.name;

DROP PROCEDURE IF EXISTS tsm_add_column;
DROP PROCEDURE IF EXISTS tsm_add_check;

SELECT 'Migration 002 done' AS result;
