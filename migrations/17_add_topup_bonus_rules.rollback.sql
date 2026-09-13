-- Rollback for 17_add_topup_bonus_rules.sql.
-- Run only after the application no longer reads the bonus columns/table.

DROP TABLE IF EXISTS topup_bonus_rules;

ALTER TABLE topup_requests
  DROP COLUMN bonus_rule_id,
  DROP COLUMN bonus_points,
  DROP COLUMN credited_points;

ALTER TABLE slip_history
  DROP COLUMN bonus_rule_id,
  DROP COLUMN bonus_points,
  DROP COLUMN credited_points;
