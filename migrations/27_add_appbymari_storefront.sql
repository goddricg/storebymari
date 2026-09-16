-- AppByMari main-store catalog bridge.
-- Product metadata is deliberately separate from the local products table.
-- API keys remain in api_providers.api_key and never cross an Admin GET response.

CREATE TABLE IF NOT EXISTS appbymari_products (
  id VARCHAR(128) NOT NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  api_provider_id VARCHAR(128) NULL,
  source_type_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  image_url LONGTEXT NULL,
  details TEXT NULL,
  category_name VARCHAR(255) NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sale_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock INT NOT NULL DEFAULT 0,
  reserved_stock INT NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  last_synced_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_appbymari_product_source (site_id, source_type_id),
  KEY idx_appbymari_product_visibility (site_id, is_enabled, stock),
  KEY idx_appbymari_product_category (site_id, category_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appbymari_purchase_requests (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  buyer_user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  source_type_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(128) NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NULL,
  reserved_amount DECIMAL(12,2) NULL,
  status VARCHAR(32) NOT NULL,
  processing_stage VARCHAR(40) NOT NULL DEFAULT 'CLAIMED',
  processing_token VARCHAR(36) NOT NULL,
  lease_expires_at DATETIME(6) NULL,
  upstream_order_id VARCHAR(255) NULL,
  upstream_payload LONGTEXT NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_appbymari_purchase_key (site_id, buyer_user_id, idempotency_key),
  KEY idx_appbymari_purchase_status (site_id, status, updated_at),
  CONSTRAINT chk_appbymari_purchase_status CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
