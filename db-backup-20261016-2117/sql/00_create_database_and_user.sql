-- ============================================================================
-- TSM (The Sealed Market) - 00_create_database_and_user.sql
-- Run this ONCE, connected as `root` in MySQL Workbench.
--
-- Creates:
--   * `tsm`       - the development database
--   * `tsm_test`  - a throwaway database the backend's automated tests will use
--   * `tsm_app`   - the account the backend connects with (NOT root)
--
-- DEV ONLY: change the password below if this machine is shared, and update
-- DATABASE_URL in backend/.env to match. Production gets a different, strong
-- password that lives only in the hosting provider's secret store.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS tsm
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

CREATE DATABASE IF NOT EXISTS tsm_test
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

-- No plugin clause on purpose: MySQL 8.4+/9.x default to caching_sha2_password,
-- which the Node `mysql2` driver supports. (mysql_native_password is disabled
-- by default on newer servers, so don't specify it.)
CREATE USER IF NOT EXISTS 'tsm_app'@'localhost' IDENTIFIED BY 'rootroot';

GRANT ALL PRIVILEGES ON tsm.*      TO 'tsm_app'@'localhost';
GRANT ALL PRIVILEGES ON tsm_test.* TO 'tsm_app'@'localhost';

FLUSH PRIVILEGES;

-- Quick check: you should see both databases and the grants for tsm_app.
SHOW DATABASES LIKE 'tsm%';
SHOW GRANTS FOR 'tsm_app'@'localhost';
