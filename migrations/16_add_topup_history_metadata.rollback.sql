DROP TABLE IF EXISTS topup_attempt_history;

ALTER TABLE topup_requests
  DROP COLUMN failure_reason;

ALTER TABLE slip_history
  DROP COLUMN source_type,
  DROP COLUMN source_user_id,
  DROP COLUMN source_label,
  DROP COLUMN source_email,
  DROP COLUMN note;
