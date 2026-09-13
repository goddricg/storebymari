-- Additive purchase bundle options for the App By Mari storefront.
-- Existing products, orders, and Master API contracts remain unchanged.

CREATE TABLE IF NOT EXISTS product_purchase_options (
  id VARCHAR(128) NOT NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  product_id VARCHAR(128) NOT NULL,
  product_type_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  price_vip DECIMAL(10,2) NULL,
  price_walkin DECIMAL(10,2) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_purchase_option_quantity (site_id, product_id, quantity),
  CONSTRAINT chk_product_purchase_option_quantity CHECK (quantity BETWEEN 2 AND 100),
  CONSTRAINT chk_product_purchase_option_price CHECK (price >= 0),
  KEY idx_product_purchase_options_product (site_id, product_id, is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storefront_purchase_requests (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  buyer_user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  product_type_id VARCHAR(255) NOT NULL,
  purchase_option_id VARCHAR(128) NOT NULL,
  quantity INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  processing_token VARCHAR(36) NOT NULL,
  lease_expires_at DATETIME(6) NULL,
  order_id VARCHAR(128) NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_storefront_purchase_request_key (site_id, buyer_user_id, idempotency_key),
  CONSTRAINT chk_storefront_purchase_request_status CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED')),
  KEY idx_storefront_purchase_request_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS purchase_option_id VARCHAR(128) NULL AFTER purchase_item_index,
  ADD COLUMN IF NOT EXISTS purchase_option_name VARCHAR(255) NULL AFTER purchase_option_id,
  ADD COLUMN IF NOT EXISTS purchase_option_quantity INT NULL AFTER purchase_option_name;

CREATE INDEX IF NOT EXISTS idx_orders_purchase_option
  ON orders (site_id, purchase_option_id);
