-- Additive cash receipts for successful system-verified top-ups.
-- Product receipts continue to use cash_receipts/receipt_counters. Top-up
-- receipts have their own monthly sequence so the two document sources cannot
-- consume or overwrite each other's numbers.

CREATE TABLE IF NOT EXISTS topup_receipt_counters (
  site_id VARCHAR(50) NOT NULL,
  receipt_year INT NOT NULL,
  receipt_month INT NOT NULL,
  last_sequence INT NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (site_id, receipt_year, receipt_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS topup_cash_receipts (
  id VARCHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  topup_request_id VARCHAR(36) NOT NULL,
  transaction_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  receipt_no VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
  issued_at DATETIME(6) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  base_points DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonus_points DECIMAL(12,2) NOT NULL DEFAULT 0,
  credited_points DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonus_rule_id VARCHAR(36) NULL,
  seller_snapshot LONGTEXT NOT NULL,
  buyer_snapshot LONGTEXT NOT NULL,
  lines_snapshot LONGTEXT NOT NULL,
  receipt_note VARCHAR(255) NULL,
  template_version VARCHAR(32) NOT NULL DEFAULT 'v5-recp-new',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_topup_cash_receipt_request (site_id, topup_request_id),
  UNIQUE KEY uq_topup_cash_receipt_no (site_id, receipt_no),
  UNIQUE KEY uq_topup_cash_receipt_transaction (site_id, transaction_id),
  KEY idx_topup_cash_receipt_user_date (site_id, user_id, issued_at),
  KEY idx_topup_cash_receipt_status_date (site_id, status, issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
