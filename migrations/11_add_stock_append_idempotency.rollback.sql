-- Rollback for the additive stock append operation journal only.
-- Existing products, account_data, orders, and stock values are preserved.

DROP TABLE IF EXISTS stock_append_requests;
