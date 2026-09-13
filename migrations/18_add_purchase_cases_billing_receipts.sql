-- Additive purchase cases, billing profiles, and cash receipts.
--
-- A purchase_case groups one Buy Now or Cart checkout. Existing orders remain
-- item-level records and are linked through orders.case_order_id.

CREATE TABLE IF NOT EXISTS purchase_cases (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  case_order_no VARCHAR(64) NOT NULL,
  buyer_user_id VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL,
  total_points DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  completed_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_case_site_no (site_id, case_order_no),
  KEY idx_purchase_case_buyer_date (site_id, buyer_user_id, created_at),
  KEY idx_purchase_case_status_date (site_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_case_items (
  id VARCHAR(36) NOT NULL,
  case_order_id VARCHAR(36) NOT NULL,
  line_index INT NOT NULL,
  product_type_id VARCHAR(255) NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  order_ids LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_case_item_line (case_order_id, line_index),
  KEY idx_purchase_case_items_case (case_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MariaDB versions used by the hosted app do not consistently support
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS. Use INFORMATION_SCHEMA guards so
-- this migration is safe to re-run on both MariaDB and MySQL.
SET @appbymari_case_order_id_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'case_order_id'
);
SET @appbymari_case_order_id_sql := IF(
  @appbymari_case_order_id_exists = 0,
  'ALTER TABLE orders ADD COLUMN case_order_id VARCHAR(36) NULL AFTER id',
  'SELECT 1'
);
PREPARE appbymari_case_order_id_stmt FROM @appbymari_case_order_id_sql;
EXECUTE appbymari_case_order_id_stmt;
DEALLOCATE PREPARE appbymari_case_order_id_stmt;

SET @appbymari_case_item_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'case_item_index'
);
SET @appbymari_case_item_index_sql := IF(
  @appbymari_case_item_index_exists = 0,
  'ALTER TABLE orders ADD COLUMN case_item_index INT NULL AFTER case_order_id',
  'SELECT 1'
);
PREPARE appbymari_case_item_index_stmt FROM @appbymari_case_item_index_sql;
EXECUTE appbymari_case_item_index_stmt;
DEALLOCATE PREPARE appbymari_case_item_index_stmt;

SET @appbymari_case_order_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_orders_case_order'
);
SET @appbymari_case_order_index_sql := IF(
  @appbymari_case_order_index_exists = 0,
  'CREATE INDEX idx_orders_case_order ON orders (site_id, case_order_id, created_at)',
  'SELECT 1'
);
PREPARE appbymari_case_order_index_stmt FROM @appbymari_case_order_index_sql;
EXECUTE appbymari_case_order_index_stmt;
DEALLOCATE PREPARE appbymari_case_order_index_stmt;

CREATE TABLE IF NOT EXISTS user_billing_profiles (
  site_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  full_name VARCHAR(255) NULL,
  tax_id VARCHAR(32) NULL,
  address_line1 TEXT NULL,
  address_line2 TEXT NULL,
  subdistrict VARCHAR(255) NULL,
  district VARCHAR(255) NULL,
  province VARCHAR(255) NULL,
  postal_code VARCHAR(20) NULL,
  phone VARCHAR(40) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (site_id, user_id),
  KEY idx_billing_profile_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add the field to an already-created billing table as well. This guard keeps
-- the existing migration safe to re-run on the hosted MariaDB/MySQL targets.
SET @appbymari_billing_tax_id_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_billing_profiles'
    AND COLUMN_NAME = 'tax_id'
);
SET @appbymari_billing_tax_id_sql := IF(
  @appbymari_billing_tax_id_exists = 0,
  'ALTER TABLE user_billing_profiles ADD COLUMN tax_id VARCHAR(32) NULL AFTER full_name',
  'SELECT 1'
);
PREPARE appbymari_billing_tax_id_stmt FROM @appbymari_billing_tax_id_sql;
EXECUTE appbymari_billing_tax_id_stmt;
DEALLOCATE PREPARE appbymari_billing_tax_id_stmt;

CREATE TABLE IF NOT EXISTS receipt_counters (
  site_id VARCHAR(50) NOT NULL,
  receipt_year INT NOT NULL,
  receipt_month INT NOT NULL,
  last_sequence INT NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (site_id, receipt_year, receipt_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_receipts (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  case_order_id VARCHAR(36) NOT NULL,
  receipt_no VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
  issued_at DATETIME(6) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  seller_snapshot LONGTEXT NOT NULL,
  buyer_snapshot LONGTEXT NOT NULL,
  lines_snapshot LONGTEXT NOT NULL,
  template_version VARCHAR(32) NOT NULL DEFAULT 'v1',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_receipt_case (site_id, case_order_id),
  UNIQUE KEY uq_cash_receipt_no (site_id, receipt_no),
  KEY idx_cash_receipt_issued_at (site_id, issued_at),
  KEY idx_cash_receipt_status (site_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cart_checkout_requests (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  buyer_user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  processing_token VARCHAR(36) NOT NULL,
  lease_expires_at DATETIME(6) NULL,
  case_order_id VARCHAR(36) NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_checkout_request_key (site_id, buyer_user_id, idempotency_key),
  KEY idx_cart_checkout_request_status (site_id, status, updated_at),
  CONSTRAINT chk_cart_checkout_request_status CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
