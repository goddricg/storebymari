-- Additive journal for provider-verified slips that still need local completion.
-- Existing users, balances, and slip history rows are preserved.

ALTER TABLE topup_requests
  ADD COLUMN verified_qr_payload MEDIUMTEXT NULL;

ALTER TABLE topup_requests
  ADD COLUMN verified_at DATETIME(6) NULL;
