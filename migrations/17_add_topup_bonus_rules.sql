-- Additive top-up bonus rules and immutable award snapshots.
-- Apply this migration before enabling the bonus rules in the Admin UI.

ALTER TABLE topup_requests
  ADD COLUMN bonus_rule_id VARCHAR(36) NULL AFTER amount,
  ADD COLUMN bonus_points DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER bonus_rule_id,
  ADD COLUMN credited_points DECIMAL(10,2) NULL AFTER bonus_points;

ALTER TABLE slip_history
  ADD COLUMN bonus_rule_id VARCHAR(36) NULL AFTER amount,
  ADD COLUMN bonus_points DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER bonus_rule_id,
  ADD COLUMN credited_points DECIMAL(10,2) NULL AFTER bonus_points;

-- Preserve the meaning of all existing successful records. They were credited
-- one point per baht and therefore have no historical bonus.
UPDATE slip_history
SET credited_points = amount
WHERE credited_points IS NULL AND status = 'success';

UPDATE topup_requests
SET credited_points = amount
WHERE credited_points IS NULL
  AND status = 'SUCCEEDED'
  AND amount IS NOT NULL;

CREATE TABLE IF NOT EXISTS topup_bonus_rules (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  trigger_amount DECIMAL(10,2) NOT NULL,
  bonus_points DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(128) NULL,
  updated_by VARCHAR(128) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_topup_bonus_rule_site_amount (site_id, trigger_amount),
  KEY idx_topup_bonus_rule_site_active (site_id, is_active, trigger_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rollback (manual, only after the application is rolled back first):
-- DROP TABLE topup_bonus_rules;
-- ALTER TABLE topup_requests
--   DROP COLUMN bonus_rule_id,
--   DROP COLUMN bonus_points,
--   DROP COLUMN credited_points;
-- ALTER TABLE slip_history
--   DROP COLUMN bonus_rule_id,
--   DROP COLUMN bonus_points,
--   DROP COLUMN credited_points;
