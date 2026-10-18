-- ============================================================================
-- Migration 003 - orders, reviews, tickets, support, payout methods, fee settings (schema v1.3)
--
-- Run this ONCE against your real "tsm" database. It keeps all your data.
-- Safe to run twice: every step first checks whether it is already done.
-- Run migration 002 first if you have not (it is already part of the v3.0 install).
--
--   Terminal:  mysql -u tsm_app -p tsm < ~/School/db/sql/migrations/003_orders_reviews_tickets.sql
--   Workbench: File > Open SQL Script... > this file > lightning bolt.
--
-- What it adds
--   platform_settings        TSM's fee (default 5.00%) and the payment / Apple fee, editable by an admin
--   orders, order_items      real purchases; a case offer hands out the next box number each time
--   reviews                  star rating + comment from the buyer, an optional reply from the seller
--   messages                 one conversation engine: sell-to-us tickets, order chats, support
--   sell_tickets, sell_ticket_items   "Sell to us" requests with offers (accept / decline / counter)
--   support_requests         Contact support, for signed-in people and guests
--   seller_payout_methods    where TSM pays a seller (details are encrypted)
--   seller_profiles          new status "revoked" (selling removed, account untouched) + when / why
--   seller_earnings          the payment fee is recorded per sale next to TSM's commission
-- ============================================================================

USE tsm;

DROP PROCEDURE IF EXISTS tsm_add_column;

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

DELIMITER ;

-- ---- seller_profiles: a third status, "revoked" ----------------------------------
ALTER TABLE seller_profiles
  MODIFY COLUMN status ENUM('active','suspended','revoked') NOT NULL DEFAULT 'active';
CALL tsm_add_column('seller_profiles', 'revoked_at',     "DATETIME(3) NULL AFTER suspended_reason");
CALL tsm_add_column('seller_profiles', 'revoked_reason', "VARCHAR(255) NULL AFTER revoked_at");

-- ---- seller_earnings: the payment fee, per sale ------------------------------------
CALL tsm_add_column('seller_earnings', 'processing_fee_bps',   "SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER commission_cents");
CALL tsm_add_column('seller_earnings', 'processing_fee_cents', "INT UNSIGNED NOT NULL DEFAULT 0 AFTER processing_fee_bps");

-- ---- the new tables -----------------------------------------------------------------
-- ---- platform settings (v1.3) -------------------------------------------------
-- Numbers an admin can change without a new release. tsm_fee_bps is TSM's flat cut of each sale
-- (500 = 5.00%). processing_fee_bps is the payment / Apple fee the seller sees and pays (0 until an admin sets it).
CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key          VARCHAR(60)  NOT NULL,
  value_int            INT          NOT NULL,
  updated_by_staff_id  CHAR(36)     NULL,
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_staff FOREIGN KEY (updated_by_staff_id) REFERENCES admin_staff (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO platform_settings (setting_key, value_int) VALUES ('tsm_fee_bps', 500), ('processing_fee_bps', 0);

-- ---- orders (v1.3): one order per seller per checkout ----------------------------
-- The shipping address is copied in at purchase time, so editing the saved address later never rewrites an order.
CREATE TABLE IF NOT EXISTS orders (
  id                CHAR(36)     NOT NULL,
  order_number      VARCHAR(20)  NOT NULL,                 -- shown to people, like TSM-7K3M9QXA
  checkout_id       CHAR(36)     NOT NULL,                 -- the orders created by one checkout share this
  buyer_id          CHAR(36)     NOT NULL,
  seller_id         CHAR(36)     NOT NULL,
  status            ENUM('placed','shipped','delivered','cancelled') NOT NULL DEFAULT 'placed',
  subtotal_cents    INT UNSIGNED NOT NULL,
  ship_name         VARCHAR(100) NOT NULL,
  ship_line1        VARCHAR(120) NOT NULL,
  ship_line2        VARCHAR(120) NULL,
  ship_city         VARCHAR(80)  NOT NULL,
  ship_region       VARCHAR(80)  NOT NULL,
  ship_postal_code  VARCHAR(20)  NOT NULL,
  ship_country      CHAR(2)      NOT NULL DEFAULT 'US',
  carrier           VARCHAR(40)  NULL,
  tracking_number   VARCHAR(80)  NULL,
  shipped_at        DATETIME(3)  NULL,
  delivered_at      DATETIME(3)  NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  KEY ix_orders_buyer (buyer_id, created_at),
  KEY ix_orders_seller (seller_id, created_at),
  KEY ix_orders_checkout (checkout_id),
  CONSTRAINT fk_orders_buyer  FOREIGN KEY (buyer_id)  REFERENCES users (id)                ON DELETE RESTRICT,
  CONSTRAINT fk_orders_seller FOREIGN KEY (seller_id) REFERENCES seller_profiles (user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- What was bought. Names and prices are copied, so an order still reads right after the offer changes.
-- For an offer taken from a case, box_first..box_last are the boxes this order received ("Boxes 4-5 of 12").
CREATE TABLE IF NOT EXISTS order_items (
  id                CHAR(36)     NOT NULL,
  order_id          CHAR(36)     NOT NULL,
  listing_id        CHAR(36)     NULL,
  product_id        CHAR(36)     NOT NULL,
  product_name      VARCHAR(160) NOT NULL,
  brand_name        VARCHAR(60)  NOT NULL,
  thumbnail_key     VARCHAR(255) NULL,
  quantity          INT UNSIGNED NOT NULL,
  unit_price_cents  INT UNSIGNED NOT NULL,
  source_label      VARCHAR(100) NULL,
  distributor       VARCHAR(120) NULL,
  box_first         SMALLINT UNSIGNED NULL,
  box_last          SMALLINT UNSIGNED NULL,
  boxes_in_case     SMALLINT UNSIGNED NULL,
  box_label         VARCHAR(60)  NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_order_items_order (order_id),
  KEY ix_order_items_product (product_id),
  CONSTRAINT fk_order_items_order   FOREIGN KEY (order_id)   REFERENCES orders (id)   ON DELETE CASCADE,
  CONSTRAINT fk_order_items_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE SET NULL,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---- reviews (v1.3): a buyer rates the seller for one bought item; the seller can answer ----
CREATE TABLE IF NOT EXISTS reviews (
  id                   CHAR(36)     NOT NULL,
  order_item_id        CHAR(36)     NOT NULL,
  order_id             CHAR(36)     NOT NULL,
  buyer_id             CHAR(36)     NOT NULL,
  seller_id            CHAR(36)     NOT NULL,
  product_id           CHAR(36)     NOT NULL,
  rating               TINYINT UNSIGNED NOT NULL,
  comment              VARCHAR(1000) NULL,
  seller_response      VARCHAR(1000) NULL,
  seller_responded_at  DATETIME(3)  NULL,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_item (order_item_id),
  KEY ix_reviews_seller (seller_id, created_at),
  KEY ix_reviews_product (product_id, created_at),
  CONSTRAINT ck_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_reviews_item    FOREIGN KEY (order_item_id) REFERENCES order_items (id)       ON DELETE CASCADE,
  CONSTRAINT fk_reviews_buyer   FOREIGN KEY (buyer_id)      REFERENCES users (id)             ON DELETE RESTRICT,
  CONSTRAINT fk_reviews_seller  FOREIGN KEY (seller_id)     REFERENCES seller_profiles (user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id)    REFERENCES products (id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---- messages (v1.3): one conversation engine for sell-to-us tickets, order chats and support ----
-- thread_kind + thread_id say which conversation a message belongs to. Offers made in a sell-to-us ticket
-- are messages too (msg_kind 'offer' / 'counter' / 'accept' / 'decline'), with the amount in amount_cents.
CREATE TABLE IF NOT EXISTS messages (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_kind   ENUM('sell_ticket','order','support') NOT NULL,
  thread_id     CHAR(36)      NOT NULL,
  sender_type   ENUM('user','seller','staff','system') NOT NULL,
  sender_id     CHAR(36)      NULL,
  sender_name   VARCHAR(80)   NOT NULL,
  body          VARCHAR(2000) NOT NULL,
  msg_kind      ENUM('text','offer','counter','accept','decline','status') NOT NULL DEFAULT 'text',
  amount_cents  INT UNSIGNED  NULL,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_messages_thread (thread_kind, thread_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---- sell-to-us tickets (v1.3): a seller offers stock to TSM; staff answer with a price ----
-- Payment happens outside the app. offer_cents is the price currently on the table and offer_by says who named it.
CREATE TABLE IF NOT EXISTS sell_tickets (
  id              CHAR(36)     NOT NULL,
  ticket_number   VARCHAR(20)  NOT NULL,
  user_id         CHAR(36)     NOT NULL,
  status          ENUM('submitted','in_review','offer_sent','countered','accepted','declined','completed') NOT NULL DEFAULT 'submitted',
  offer_cents     INT UNSIGNED NULL,
  offer_by        ENUM('staff','user') NULL,
  decision_note   VARCHAR(500) NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  closed_at       DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sell_tickets_number (ticket_number),
  KEY ix_sell_tickets_user (user_id, created_at),
  KEY ix_sell_tickets_status (status, updated_at),
  CONSTRAINT fk_sell_tickets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sell_ticket_items (
  id                 CHAR(36)     NOT NULL,
  ticket_id          CHAR(36)     NOT NULL,
  product_name       VARCHAR(160) NOT NULL,
  quantity           INT UNSIGNED NOT NULL,
  source             VARCHAR(120) NOT NULL DEFAULT '',
  min_price_cents    INT UNSIGNED NOT NULL DEFAULT 0,      -- the least the seller will take per item
  removed_by_admin   TINYINT(1)   NOT NULL DEFAULT 0,      -- staff dropped this line from the deal
  sort_order         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_sell_ticket_items_ticket (ticket_id),
  CONSTRAINT fk_sell_ticket_items_ticket FOREIGN KEY (ticket_id) REFERENCES sell_tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---- contact support (v1.3): signed-in people and guests ----
-- user_id is NULL for a guest, who is answered by email. The question itself is the first row in messages.
CREATE TABLE IF NOT EXISTS support_requests (
  id          CHAR(36)     NOT NULL,
  ref         VARCHAR(20)  NOT NULL,
  user_id     CHAR(36)     NULL,
  name        VARCHAR(80)  NOT NULL,
  email       VARCHAR(255) NOT NULL,
  topic       ENUM('account','order','selling','payment','other') NOT NULL DEFAULT 'other',
  subject     VARCHAR(120) NOT NULL,
  status      ENUM('open','answered','closed') NOT NULL DEFAULT 'open',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_support_ref (ref),
  KEY ix_support_status (status, updated_at),
  KEY ix_support_user (user_id, created_at),
  CONSTRAINT fk_support_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---- seller payout method (v1.3): where TSM pays the seller (the payment itself happens outside the app) ----
-- The account details are encrypted before they are stored (AES-256-GCM, see backend/src/lib/crypto.js).
-- display_label is the safe, masked text, such as "Bank account ending 6789".
CREATE TABLE IF NOT EXISTS seller_payout_methods (
  seller_id       CHAR(36)     NOT NULL,
  method_type     ENUM('bank_transfer','paypal','zelle','check') NOT NULL,
  account_holder  VARCHAR(100) NOT NULL,
  display_label   VARCHAR(120) NOT NULL,
  details_enc     VARBINARY(2048) NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (seller_id),
  CONSTRAINT fk_payout_method_seller FOREIGN KEY (seller_id) REFERENCES seller_profiles (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP PROCEDURE IF EXISTS tsm_add_column;

SELECT 'Migration 003 done' AS result;
