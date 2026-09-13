-- Rollback for migration 18. Run only after the application is rolled back.
DROP TABLE IF EXISTS cart_checkout_requests;
DROP TABLE IF EXISTS cash_receipts;
DROP TABLE IF EXISTS receipt_counters;
DROP TABLE IF EXISTS user_billing_profiles;

-- Use INFORMATION_SCHEMA guards because hosted MariaDB versions do not
-- consistently support DROP INDEX/COLUMN IF EXISTS.
SET @appbymari_case_order_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_orders_case_order'
);
SET @appbymari_case_order_index_sql := IF(
  @appbymari_case_order_index_exists > 0,
  'DROP INDEX idx_orders_case_order ON orders',
  'SELECT 1'
);
PREPARE appbymari_case_order_index_stmt FROM @appbymari_case_order_index_sql;
EXECUTE appbymari_case_order_index_stmt;
DEALLOCATE PREPARE appbymari_case_order_index_stmt;

SET @appbymari_case_item_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'case_item_index'
);
SET @appbymari_case_item_index_sql := IF(
  @appbymari_case_item_index_exists > 0,
  'ALTER TABLE orders DROP COLUMN case_item_index',
  'SELECT 1'
);
PREPARE appbymari_case_item_index_stmt FROM @appbymari_case_item_index_sql;
EXECUTE appbymari_case_item_index_stmt;
DEALLOCATE PREPARE appbymari_case_item_index_stmt;

SET @appbymari_case_order_id_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'case_order_id'
);
SET @appbymari_case_order_id_sql := IF(
  @appbymari_case_order_id_exists > 0,
  'ALTER TABLE orders DROP COLUMN case_order_id',
  'SELECT 1'
);
PREPARE appbymari_case_order_id_stmt FROM @appbymari_case_order_id_sql;
EXECUTE appbymari_case_order_id_stmt;
DEALLOCATE PREPARE appbymari_case_order_id_stmt;

DROP TABLE IF EXISTS purchase_case_items;
DROP TABLE IF EXISTS purchase_cases;
