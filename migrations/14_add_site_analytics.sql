-- Additive site analytics storage for public page views and live presence.
-- Timestamps are stored in the existing database wall-clock convention (Asia/Bangkok).

CREATE TABLE IF NOT EXISTS site_analytics_visits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id VARCHAR(50) NOT NULL,
  event_id CHAR(36) NOT NULL,
  visitor_id CHAR(36) NOT NULL,
  user_id VARCHAR(128) NULL,
  page_path VARCHAR(255) NOT NULL,
  visited_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_analytics_visits_event (site_id, event_id),
  KEY idx_site_analytics_visits_site_time (site_id, visited_at),
  KEY idx_site_analytics_visits_site_visitor_time (site_id, visitor_id, visited_at),
  KEY idx_site_analytics_visits_site_user_time (site_id, user_id, visited_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_analytics_presence (
  site_id VARCHAR(50) NOT NULL,
  visitor_id CHAR(36) NOT NULL,
  user_id VARCHAR(128) NULL,
  page_path VARCHAR(255) NOT NULL,
  first_seen_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  PRIMARY KEY (site_id, visitor_id),
  KEY idx_site_analytics_presence_site_last_seen (site_id, last_seen_at),
  KEY idx_site_analytics_presence_site_user_last_seen (site_id, user_id, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
