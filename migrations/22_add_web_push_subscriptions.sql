-- Store Web Push Subscriptions for instant mobile and desktop notifications
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  endpoint TEXT NOT NULL,
  endpoint_hash VARCHAR(64) NOT NULL,
  p256dh TEXT NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_web_push_endpoint_hash (endpoint_hash),
  KEY idx_web_push_user (user_id, site_id),
  KEY idx_web_push_role (site_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
