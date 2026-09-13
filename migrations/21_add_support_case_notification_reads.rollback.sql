-- Rollback for 21_add_support_case_notification_reads.sql.
-- Apply only after rolling back the application code that reads this table.

DROP TABLE IF EXISTS support_case_notification_reads;
