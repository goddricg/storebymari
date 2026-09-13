-- Durable, privacy-safe audit history for administrative actions.
-- This table is append-only from the application layer and intentionally keeps
-- actor snapshots so history remains readable after a user is changed or removed.

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id CHAR(36) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  actor_id VARCHAR(128) NULL,
  actor_email VARCHAR(255) NULL,
  actor_name VARCHAR(255) NULL,
  actor_role VARCHAR(32) NULL,
  event_action VARCHAR(80) NOT NULL,
  event_category VARCHAR(40) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'info',
  result VARCHAR(16) NOT NULL DEFAULT 'success',
  entity_type VARCHAR(80) NULL,
  entity_id VARCHAR(255) NULL,
  entity_label VARCHAR(255) NULL,
  reason_code VARCHAR(120) NULL,
  details TEXT NULL,
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  changes_json LONGTEXT NULL,
  request_id VARCHAR(128) NULL,
  route VARCHAR(255) NULL,
  method VARCHAR(16) NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'admin',
  user_agent VARCHAR(512) NULL,
  occurred_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_admin_audit_site_time (site_id, occurred_at, id),
  KEY idx_admin_audit_site_actor_time (site_id, actor_id, occurred_at),
  KEY idx_admin_audit_site_action_time (site_id, event_action, occurred_at),
  KEY idx_admin_audit_site_entity_time (site_id, entity_type, entity_id, occurred_at),
  KEY idx_admin_audit_site_result_time (site_id, result, occurred_at),
  KEY idx_admin_audit_request (site_id, request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
