-- Additive operation journal for admin account-stock append requests.
-- This does not alter existing products or order data.

CREATE TABLE IF NOT EXISTS stock_append_requests (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  type_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  accepted_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  invalid_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_append_site_actor_key (site_id, actor_id, idempotency_key),
  KEY idx_stock_append_status_updated (site_id, status, updated_at),
  KEY idx_stock_append_product_created (site_id, product_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
