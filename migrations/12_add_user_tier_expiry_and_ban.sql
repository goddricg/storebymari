-- Additive user controls for expiring tiers and account bans.
-- Run only after confirming the target database schema. No existing rows are removed.
ALTER TABLE users
  ADD COLUMN tier_expires_at DATETIME(6) NULL AFTER user_tier,
  ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0 AFTER tier_expires_at,
  ADD KEY idx_users_site_tier_expires (site_id, tier_expires_at),
  ADD KEY idx_users_site_banned (site_id, is_banned);
