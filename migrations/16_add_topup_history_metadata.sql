-- Additive metadata for the complete top-up audit timeline.
-- Existing topup requests, slip history, balances, and transactions are preserved.

ALTER TABLE topup_requests
  ADD COLUMN failure_reason VARCHAR(255) NULL AFTER error_code;

ALTER TABLE slip_history
  ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM' AFTER status,
  ADD COLUMN source_user_id VARCHAR(128) NULL AFTER source_type,
  ADD COLUMN source_label VARCHAR(255) NULL AFTER source_user_id,
  ADD COLUMN source_email VARCHAR(255) NULL AFTER source_label,
  ADD COLUMN note VARCHAR(255) NULL AFTER source_email;

CREATE INDEX idx_topup_requests_site_created
  ON topup_requests (site_id, created_at);

CREATE INDEX idx_slip_history_site_created
  ON slip_history (site_id, created_at);

CREATE TABLE IF NOT EXISTS topup_attempt_history (
  id VARCHAR(36) NOT NULL,
  request_id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  transaction_id VARCHAR(255) NULL,
  amount DECIMAL(10,2) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'FAILED',
  response_status INT NULL,
  error_code VARCHAR(64) NULL,
  failure_reason VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_topup_attempt_request (request_id, created_at),
  KEY idx_topup_attempt_site_created (site_id, created_at),
  KEY idx_topup_attempt_user_created (site_id, user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve failures that happened before this migration was installed.
-- Existing error codes are converted to the same Thai labels used by the app.
INSERT INTO topup_attempt_history (
  id, request_id, site_id, user_id, idempotency_key, request_fingerprint,
  transaction_id, amount, status, response_status, error_code, failure_reason,
  created_at
)
SELECT
  UUID(), tr.id, tr.site_id, tr.user_id, tr.idempotency_key, tr.request_fingerprint,
  tr.transaction_id, tr.amount, 'FAILED', tr.response_status, tr.error_code,
  CASE
    WHEN NULLIF(TRIM(tr.failure_reason), '') IS NOT NULL THEN tr.failure_reason
    WHEN tr.error_code = 'DUPLICATE_SLIP' THEN 'สลิปซ้ำ'
    WHEN tr.error_code = 'INVALID_ACCOUNT' THEN 'บัญชีผู้รับเงินไม่ตรงกับระบบ'
    WHEN tr.error_code = 'INVALID_AMOUNT' THEN 'ยอดเงินไม่ถูกต้องหรือไม่ถึงขั้นต่ำ'
    WHEN tr.error_code = 'INVALID_QR' THEN 'ข้อมูลสลิปไม่ถูกต้อง'
    WHEN tr.error_code = 'API_ERROR' THEN 'ระบบตรวจสอบสลิปขัดข้องชั่วคราว'
    WHEN tr.error_code = 'DATABASE_ERROR' THEN 'ระบบบันทึกข้อมูลขัดข้อง'
    WHEN tr.error_code = 'UNAUTHORIZED' THEN 'บัญชีผู้ใช้ไม่พร้อมใช้งาน'
    ELSE 'ไม่ทราบสาเหตุ'
  END,
  tr.updated_at
FROM topup_requests tr
WHERE tr.status = 'FAILED'
  AND NOT EXISTS (
    SELECT 1
    FROM topup_attempt_history tah
    WHERE tah.request_id = tr.id
  );

-- Rollback (manual, only after the application is rolled back first):
-- DROP TABLE topup_attempt_history;
-- ALTER TABLE topup_requests DROP COLUMN failure_reason;
-- ALTER TABLE slip_history
--   DROP COLUMN source_type,
--   DROP COLUMN source_user_id,
--   DROP COLUMN source_label,
--   DROP COLUMN source_email,
--   DROP COLUMN note;
