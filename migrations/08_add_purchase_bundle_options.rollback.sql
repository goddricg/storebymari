-- Rollback for 08_add_purchase_bundle_options.sql.
-- Run only after package-option data has been archived or intentionally removed.

DROP INDEX IF EXISTS idx_orders_purchase_option ON orders;

ALTER TABLE orders
  DROP COLUMN IF EXISTS purchase_option_quantity,
  DROP COLUMN IF EXISTS purchase_option_name,
  DROP COLUMN IF EXISTS purchase_option_id;

DROP TABLE IF EXISTS storefront_purchase_requests;
DROP TABLE IF EXISTS product_purchase_options;
