-- ============================================================================
-- Migration 004 - support routed to sellers, TSM featured listings, favorite sellers (schema v1.4)
--
-- Run this ONCE against your real "tsm" database. It keeps all your data.
-- Safe to run twice: every step first checks whether it is already done.
-- Run migration 003 first if you have not (it is part of the v4.0 install).
--
--   Terminal:  mysql -u tsm_app -p tsm < ~/School/db/sql/migrations/004_support_routing_featured_favorites.sql
--   Workbench: File > Open SQL Script... > this file > lightning bolt.
--
-- What it adds
--   seller_profiles.is_house     marks TSM's own storefront. The backend creates that one row the first time an admin posts
--                                a featured listing; its listings always sit at the top of a product, with a purple border
--   support_requests             seller_id + order_id (which seller / order a request is about), handler ('seller' or 'tsm')
--                                and who took it over, so a buyer's message reaches the seller's dashboard and TSM keeps access
--   favorite_sellers             a buyer's hearted sellers
-- The fee limits were removed in the backend only; nothing in the database changes for that, and every sale already
-- keeps the fee rates it was made at (seller_earnings.commission_bps / processing_fee_bps).
-- ============================================================================

USE tsm;

DROP PROCEDURE IF EXISTS tsm_add_column;
DROP PROCEDURE IF EXISTS tsm_add_index;
DROP PROCEDURE IF EXISTS tsm_add_fk;

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

CREATE PROCEDURE tsm_add_index(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx) THEN
    SET @tsm_sql = CONCAT('ALTER TABLE `', tbl, '` ADD KEY `', idx, '` (', cols, ')');
    PREPARE tsm_stmt FROM @tsm_sql;
    EXECUTE tsm_stmt;
    DEALLOCATE PREPARE tsm_stmt;
  END IF;
END//

CREATE PROCEDURE tsm_add_fk(IN tbl VARCHAR(64), IN fk VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl
                    AND CONSTRAINT_NAME = fk AND CONSTRAINT_TYPE = 'FOREIGN KEY') THEN
    SET @tsm_sql = CONCAT('ALTER TABLE `', tbl, '` ADD CONSTRAINT `', fk, '` ', ddl);
    PREPARE tsm_stmt FROM @tsm_sql;
    EXECUTE tsm_stmt;
    DEALLOCATE PREPARE tsm_stmt;
  END IF;
END//

DELIMITER ;

-- ---- seller_profiles: TSM's own storefront ----------------------------------------------
CALL tsm_add_column('seller_profiles', 'is_house',
  "TINYINT(1) NOT NULL DEFAULT 0 AFTER sales_count");

-- ---- support_requests: routed to a seller, with TSM able to take over ---------------------
CALL tsm_add_column('support_requests', 'seller_id', "CHAR(36) NULL AFTER status");
CALL tsm_add_column('support_requests', 'order_id', "CHAR(36) NULL AFTER seller_id");
CALL tsm_add_column('support_requests', 'handler', "ENUM('tsm','seller') NOT NULL DEFAULT 'tsm' AFTER order_id");
CALL tsm_add_column('support_requests', 'taken_over_at', "DATETIME(3) NULL AFTER handler");
CALL tsm_add_column('support_requests', 'taken_over_by_staff_id', "CHAR(36) NULL AFTER taken_over_at");
CALL tsm_add_index('support_requests', 'ix_support_seller', '`seller_id`, `status`, `updated_at`');
CALL tsm_add_index('support_requests', 'ix_support_order', '`order_id`');
CALL tsm_add_fk('support_requests', 'fk_support_seller',
  'FOREIGN KEY (`seller_id`) REFERENCES seller_profiles (`user_id`) ON DELETE SET NULL');
CALL tsm_add_fk('support_requests', 'fk_support_order',
  'FOREIGN KEY (`order_id`) REFERENCES orders (`id`) ON DELETE SET NULL');
CALL tsm_add_fk('support_requests', 'fk_support_taken',
  'FOREIGN KEY (`taken_over_by_staff_id`) REFERENCES admin_staff (`id`) ON DELETE SET NULL');

-- ---- favorite sellers ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorite_sellers (
  user_id     CHAR(36)    NOT NULL,
  seller_id   CHAR(36)    NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, seller_id),
  KEY ix_favorite_sellers_seller (seller_id),
  CONSTRAINT fk_favsellers_user   FOREIGN KEY (user_id)   REFERENCES users (id)                ON DELETE CASCADE,
  CONSTRAINT fk_favsellers_seller FOREIGN KEY (seller_id) REFERENCES seller_profiles (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP PROCEDURE IF EXISTS tsm_add_column;
DROP PROCEDURE IF EXISTS tsm_add_index;
DROP PROCEDURE IF EXISTS tsm_add_fk;

SELECT 'Migration 004 done' AS result;
