-- Rollback only the additive columns and indexes introduced by migration 06.
-- The pre-existing purchase_requests table and all historical orders remain.

DROP INDEX IF EXISTS idx_products_type_id ON products;
DROP INDEX IF EXISTS uq_orders_purchase_item ON orders;

ALTER TABLE orders
  DROP COLUMN IF EXISTS purchase_item_index,
  DROP COLUMN IF EXISTS purchase_request_id;

DROP INDEX IF EXISTS idx_purchase_requests_tenant_status ON purchase_requests;
DROP INDEX IF EXISTS uq_purchase_requests_tenant_key ON purchase_requests;

ALTER TABLE purchase_requests
  DROP COLUMN IF EXISTS fulfillment_payload,
  DROP COLUMN IF EXISTS reserved_amount,
  DROP COLUMN IF EXISTS lease_expires_at,
  DROP COLUMN IF EXISTS processing_token,
  DROP COLUMN IF EXISTS processing_stage,
  DROP COLUMN IF EXISTS saved_response,
  DROP COLUMN IF EXISTS order_id,
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS request_fingerprint,
  DROP COLUMN IF EXISTS tenant_id;
