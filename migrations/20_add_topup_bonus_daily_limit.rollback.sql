-- Rollback for 20_add_topup_bonus_daily_limit.sql.
-- Apply only after rolling back the application code that reads the new field.

DROP INDEX idx_slip_history_bonus_quota ON slip_history;

ALTER TABLE topup_requests
  DROP COLUMN bonus_award_finalized;
