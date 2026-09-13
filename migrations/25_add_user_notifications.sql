-- Store user/customer notifications for order completion, support case updates, and broadcasts.
CREATE TABLE IF NOT EXISTS user_notifications (
  id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  type VARCHAR(50) NOT NULL, -- 'support_resolved', 'support_reply', 'order_success', 'broadcast'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link_url VARCHAR(255) NULL,
  reference_id VARCHAR(128) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_user_notif_user_unread (user_id, site_id, is_read, created_at),
  KEY idx_user_notif_type (user_id, type, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
