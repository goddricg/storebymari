-- Add assignee and handling timestamp to support_cases
ALTER TABLE support_cases
  ADD COLUMN IF NOT EXISTS handled_by_id VARCHAR(128) NULL AFTER shop_name,
  ADD COLUMN IF NOT EXISTS handled_by_name VARCHAR(100) NULL AFTER handled_by_id,
  ADD COLUMN IF NOT EXISTS handled_at DATETIME(6) NULL AFTER handled_by_name;

CREATE INDEX IF NOT EXISTS idx_support_cases_handled ON support_cases (site_id, handled_by_id, status);
