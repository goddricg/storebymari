-- Rollback
ALTER TABLE support_cases
  DROP INDEX IF EXISTS idx_support_cases_handled,
  DROP COLUMN IF EXISTS handled_at,
  DROP COLUMN IF EXISTS handled_by_name,
  DROP COLUMN IF EXISTS handled_by_id;
