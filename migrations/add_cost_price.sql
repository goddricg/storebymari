-- สคริปต์นี้สำหรับเพิ่มคอลัมน์ cost_price ลงในตาราง products
-- กรุณารันคำสั่งนี้บน Plesk / phpMyAdmin ก่อนอัปเดตโค้ด

ALTER TABLE products 
ADD COLUMN cost_price DECIMAL(10,2) NULL AFTER price_vip;
