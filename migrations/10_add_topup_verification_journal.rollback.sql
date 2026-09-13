-- Run only after confirming there are no pending recovery records.
ALTER TABLE topup_requests
  DROP COLUMN verified_qr_payload;

ALTER TABLE topup_requests
  DROP COLUMN verified_at;
