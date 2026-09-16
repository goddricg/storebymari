-- StoreByMari presentation override for AppByMari product images.
-- The source image remains sync-owned; this column survives future syncs.

ALTER TABLE appbymari_products
  ADD COLUMN IF NOT EXISTS image_override_url LONGTEXT NULL AFTER image_url;
