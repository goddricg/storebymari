-- Store PWA installation and download tracking per site and visitor.
CREATE TABLE IF NOT EXISTS pwa_installs (
  id VARCHAR(128) NOT NULL,
  site_id VARCHAR(50) NOT NULL DEFAULT 'main',
  visitor_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(128) NULL,
  platform VARCHAR(50) NOT NULL DEFAULT 'other', -- 'ios', 'android', 'windows', 'mac', 'other'
  device_type VARCHAR(50) NOT NULL DEFAULT 'mobile', -- 'mobile', 'tablet', 'desktop'
  source VARCHAR(64) NOT NULL DEFAULT 'appinstalled_event', -- 'appinstalled_event', 'prompt_accepted', 'standalone_first_open', 'install_modal'
  user_agent VARCHAR(255) NULL,
  install_count INT UNSIGNED NOT NULL DEFAULT 1,
  first_installed_at DATETIME(6) NOT NULL,
  last_installed_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pwa_installs_site_visitor (site_id, visitor_id),
  KEY idx_pwa_installs_time (site_id, created_at),
  KEY idx_pwa_installs_platform (site_id, platform),
  KEY idx_pwa_installs_device (site_id, device_type),
  KEY idx_pwa_installs_user (site_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
