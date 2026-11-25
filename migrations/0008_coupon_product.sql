ALTER TABLE coupons ADD COLUMN product_id TEXT REFERENCES products(id);
CREATE INDEX IF NOT EXISTS idx_coupons_product ON coupons(store_id,product_id);
