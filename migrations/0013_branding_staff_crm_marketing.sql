CREATE TABLE IF NOT EXISTS store_branding(store_id TEXT PRIMARY KEY REFERENCES stores(id),commercial_name TEXT NOT NULL,accent_color TEXT NOT NULL,receipt_footer TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS store_staff(store_id TEXT NOT NULL REFERENCES stores(id),user_id TEXT NOT NULL REFERENCES users(id),department TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('active','suspended')),PRIMARY KEY(store_id,user_id));
CREATE TABLE IF NOT EXISTS marketing_campaigns(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),title TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_campaign_store ON marketing_campaigns(store_id,created_at);
CREATE INDEX IF NOT EXISTS idx_crm_customer ON orders(store_id,customer_id,created_at);
