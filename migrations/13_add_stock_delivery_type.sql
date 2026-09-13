-- Additive stock delivery classification for account and link pools.
-- Existing products default to the legacy Account Pool behavior.
-- Do not remove or rewrite existing account_data rows.

ALTER TABLE products
  ADD COLUMN stock_delivery_type VARCHAR(32) NOT NULL DEFAULT 'account-pool'
  AFTER account_data;

-- Rollback (manual, only if the application is rolled back first):
-- ALTER TABLE products DROP COLUMN stock_delivery_type;
