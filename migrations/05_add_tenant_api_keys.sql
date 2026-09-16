CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  api_key VARCHAR(255) NOT NULL UNIQUE,
  site_name VARCHAR(255),
  is_enabled BOOLEAN DEFAULT TRUE,
  is_site_suspended TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The Admin API and tenant runtime both read this flag. Add it for an
-- already-existing table without changing or removing any key material.
-- INFORMATION_SCHEMA is used because hosted MariaDB versions do not all
-- support ALTER TABLE ... ADD COLUMN IF NOT EXISTS consistently.
SET @storebymari_tenant_api_keys_suspended_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tenant_api_keys'
    AND COLUMN_NAME = 'is_site_suspended'
);
SET @storebymari_tenant_api_keys_suspended_sql := IF(
  @storebymari_tenant_api_keys_suspended_exists = 0,
  'ALTER TABLE tenant_api_keys ADD COLUMN is_site_suspended TINYINT(1) NOT NULL DEFAULT 0 AFTER is_enabled',
  'SELECT 1'
);
PREPARE storebymari_tenant_api_keys_suspended_stmt
  FROM @storebymari_tenant_api_keys_suspended_sql;
EXECUTE storebymari_tenant_api_keys_suspended_stmt;
DEALLOCATE PREPARE storebymari_tenant_api_keys_suspended_stmt;
