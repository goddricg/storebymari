-- Additive top-up idempotency state for slip verification retries.
-- Existing users, points, and slip history rows are preserved.

CREATE TABLE IF NOT EXISTS topup_requests (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  processing_token VARCHAR(36) NOT NULL,
  lease_expires_at DATETIME(6) NULL,
  transaction_id VARCHAR(255) NULL,
  amount DECIMAL(10,2) NULL,
  response_status INT NULL,
  saved_response LONGTEXT NULL,
  error_code VARCHAR(64) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_topup_requests_user_key (site_id, user_id, idempotency_key),
  CONSTRAINT chk_topup_requests_status CHECK (status IN ('PROCESSING', 'SUCCEEDED', 'FAILED')),
  KEY idx_topup_requests_status_updated (status, updated_at),
  KEY idx_topup_requests_transaction (site_id, transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
