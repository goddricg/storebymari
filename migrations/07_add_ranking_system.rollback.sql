-- Rollback only the additive ranking profile table.
-- Existing users, avatars in public/, slips, orders, and settings remain untouched.

DROP TABLE IF EXISTS user_profile_preferences;

