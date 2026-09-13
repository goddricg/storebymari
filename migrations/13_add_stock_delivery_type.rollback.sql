-- Rollback for 13_add_stock_delivery_type.sql.
-- Run only after confirming no product still depends on the new classification.

ALTER TABLE products
  DROP COLUMN stock_delivery_type;
