-- Store By Mari -> AppByMari central support forwarding metadata.
-- The runtime bootstrap in src/lib/support/center-schema.ts applies the same
-- additive change when a hosted migration runner is unavailable.

SET @storebymari_center_case_id_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'support_cases'
    AND COLUMN_NAME = 'center_case_id'
);
SET @storebymari_center_case_id_sql := IF(
  @storebymari_center_case_id_exists = 0,
  'ALTER TABLE support_cases ADD COLUMN center_case_id VARCHAR(128) NULL AFTER shop_name',
  'SELECT 1'
);
PREPARE storebymari_center_case_id_stmt FROM @storebymari_center_case_id_sql;
EXECUTE storebymari_center_case_id_stmt;
DEALLOCATE PREPARE storebymari_center_case_id_stmt;

SET @storebymari_center_case_code_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'support_cases'
    AND COLUMN_NAME = 'center_case_code'
);
SET @storebymari_center_case_code_sql := IF(
  @storebymari_center_case_code_exists = 0,
  'ALTER TABLE support_cases ADD COLUMN center_case_code VARCHAR(100) NULL AFTER center_case_id',
  'SELECT 1'
);
PREPARE storebymari_center_case_code_stmt FROM @storebymari_center_case_code_sql;
EXECUTE storebymari_center_case_code_stmt;
DEALLOCATE PREPARE storebymari_center_case_code_stmt;

SET @storebymari_center_synced_at_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'support_cases'
    AND COLUMN_NAME = 'center_synced_at'
);
SET @storebymari_center_synced_at_sql := IF(
  @storebymari_center_synced_at_exists = 0,
  'ALTER TABLE support_cases ADD COLUMN center_synced_at DATETIME(6) NULL AFTER center_case_code',
  'SELECT 1'
);
PREPARE storebymari_center_synced_at_stmt FROM @storebymari_center_synced_at_sql;
EXECUTE storebymari_center_synced_at_stmt;
DEALLOCATE PREPARE storebymari_center_synced_at_stmt;

SET @storebymari_center_sync_error_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'support_cases'
    AND COLUMN_NAME = 'center_sync_error'
);
SET @storebymari_center_sync_error_sql := IF(
  @storebymari_center_sync_error_exists = 0,
  'ALTER TABLE support_cases ADD COLUMN center_sync_error TEXT NULL AFTER center_synced_at',
  'SELECT 1'
);
PREPARE storebymari_center_sync_error_stmt FROM @storebymari_center_sync_error_sql;
EXECUTE storebymari_center_sync_error_stmt;
DEALLOCATE PREPARE storebymari_center_sync_error_stmt;
