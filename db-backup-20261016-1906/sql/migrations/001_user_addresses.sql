-- ============================================================================
-- Migration 001 - saved shipping address (schema v1.1)
--
-- Run this ONCE against your real "tsm" database to add the new table WITHOUT
-- wiping your data. (Re-running 01_schema.sql would reset everything.)
-- Safe to run twice: it only creates the table if it is missing.
--
--   Workbench: File > Open SQL Script... > this file > lightning bolt.
--   or:        mysql -u root -p < db/sql/migrations/001_user_addresses.sql
-- ============================================================================

USE tsm;

CREATE TABLE IF NOT EXISTS user_addresses (
  user_id      CHAR(36)     NOT NULL,
  full_name    VARCHAR(100) NOT NULL,
  line1        VARCHAR(120) NOT NULL,
  line2        VARCHAR(120) NULL,
  city         VARCHAR(80)  NOT NULL,
  region       VARCHAR(80)  NOT NULL,
  postal_code  VARCHAR(20)  NOT NULL,
  country      CHAR(2)      NOT NULL DEFAULT 'US',
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_address_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT 'user_addresses is ready' AS result;
