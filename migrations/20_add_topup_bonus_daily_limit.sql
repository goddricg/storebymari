-- Limit each exact-match top-up promotion to two awarded bonuses per user and
-- Bangkok calendar day. The request flag keeps the provider-time rule snapshot
-- separate from the final quota decision made in the balance transaction.

ALTER TABLE topup_requests
  ADD COLUMN bonus_award_finalized TINYINT(1) NOT NULL DEFAULT 1 AFTER credited_points;

CREATE INDEX idx_slip_history_bonus_quota
  ON slip_history (
    site_id,
    user_id,
    bonus_rule_id,
    source_type,
    status,
    created_at
  );
