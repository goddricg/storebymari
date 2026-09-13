ALTER TABLE users
  DROP KEY idx_users_site_tier_expires,
  DROP KEY idx_users_site_banned,
  DROP COLUMN is_banned,
  DROP COLUMN tier_expires_at;
