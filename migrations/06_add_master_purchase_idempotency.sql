-- Additive migration for master API purchase idempotency.
-- Safe for the pre-existing purchase_requests table and existing orders.

CREATE TABLE IF NOT EXISTS purchase_requests (
  id VARCHAR(36) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  product_type_id VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  response_status INT NULL,
  response_json LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_requests_idempotency (
    scope,
    site_id,
    actor_id,
    idempotency_key
  ),
  KEY idx_purchase_requests_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64) NULL AFTER idempotency_key,
  ADD COLUMN IF NOT EXISTS product_id VARCHAR(128) NULL AFTER product_type_id,
  ADD COLUMN IF NOT EXISTS order_id VARCHAR(128) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS saved_response LONGTEXT NULL AFTER response_json,
  ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(32) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS processing_token VARCHAR(36) NULL AFTER processing_stage,
  ADD COLUMN IF NOT EXISTS lease_expires_at DATETIME(6) NULL AFTER processing_token,
  ADD COLUMN IF NOT EXISTS reserved_amount DECIMAL(10,2) NULL AFTER lease_expires_at,
  ADD COLUMN IF NOT EXISTS fulfillment_payload LONGTEXT NULL AFTER reserved_amount;

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_requests_tenant_key
  ON purchase_requests (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_tenant_status
  ON purchase_requests (tenant_id, status, updated_at);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS purchase_request_id VARCHAR(36) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS purchase_item_index INT NULL AFTER purchase_request_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_purchase_item
  ON orders (purchase_request_id, purchase_item_index);

CREATE INDEX IF NOT EXISTS idx_products_type_id
  ON products (type_id);
