ALTER TABLE users ADD COLUMN site_id VARCHAR(50) NOT NULL DEFAULT 'main';
ALTER TABLE orders ADD COLUMN site_id VARCHAR(50) NOT NULL DEFAULT 'main';
CREATE INDEX idx_orders_site_id ON orders(site_id);
ALTER TABLE slip_history ADD COLUMN site_id VARCHAR(50) NOT NULL DEFAULT 'main';
CREATE INDEX idx_slip_history_site_id ON slip_history(site_id);
CREATE TABLE site_product_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id VARCHAR(50) NOT NULL,
  product_id INT NOT NULL,
  retail_price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_site_product (site_id, product_id)
);
