CREATE TABLE IF NOT EXISTS `broadcast_notifications` (
  `id` VARCHAR(64) NOT NULL,
  `site_id` VARCHAR(50) NOT NULL DEFAULT 'main',
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `url` VARCHAR(500) NULL,
  `target` VARCHAR(50) NOT NULL DEFAULT 'ALL',
  `sender_id` VARCHAR(64) NULL,
  `sender_email` VARCHAR(255) NULL,
  `sender_name` VARCHAR(255) NULL,
  `recipients_count` INT NOT NULL DEFAULT 0,
  `sent_count` INT NOT NULL DEFAULT 0,
  `failed_count` INT NOT NULL DEFAULT 0,
  `cleaned_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  INDEX `idx_broadcast_site_created` (`site_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
