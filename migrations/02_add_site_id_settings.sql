ALTER TABLE settings ADD COLUMN site_id VARCHAR(50) NOT NULL DEFAULT 'main';
DROP INDEX `key` ON settings;
CREATE UNIQUE INDEX idx_settings_key_site ON settings(`key`, site_id);

ALTER TABLE support_cases ADD COLUMN site_id VARCHAR(50) NOT NULL DEFAULT 'main';
CREATE INDEX idx_support_cases_site_id ON support_cases(site_id);
