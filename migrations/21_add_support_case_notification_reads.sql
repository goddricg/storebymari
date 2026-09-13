-- Store support-case notification reads per tenant and per admin user.
-- A notification is unread until that specific Admin/SuperAdmin opens it.

CREATE TABLE IF NOT EXISTS support_case_notification_reads (
  site_id VARCHAR(50) NOT NULL,
  support_case_id VARCHAR(128) NOT NULL,
  admin_user_id VARCHAR(128) NOT NULL,
  read_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (site_id, support_case_id, admin_user_id),
  KEY idx_support_case_notification_reads_admin (
    site_id,
    admin_user_id,
    read_at
  ),
  KEY idx_support_case_notification_reads_case (
    site_id,
    support_case_id
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
