-- Additive schema for the Main Site monthly ranking and user avatar selection.
-- This migration does not change or remove existing users, slips, orders, or products.

CREATE TABLE IF NOT EXISTS user_profile_preferences (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  avatar_key VARCHAR(32) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_profile_preferences_user_site (user_id, site_id),
  KEY idx_user_profile_preferences_site_avatar (site_id, avatar_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

