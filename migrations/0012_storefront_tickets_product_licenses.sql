CREATE TABLE IF NOT EXISTS storefront_profiles(store_id TEXT PRIMARY KEY REFERENCES stores(id),slug TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',maintenance INTEGER NOT NULL DEFAULT 0 CHECK(maintenance IN(0,1)));
CREATE TABLE IF NOT EXISTS product_licenses(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),product_id TEXT NOT NULL REFERENCES products(id),key_hash TEXT NOT NULL UNIQUE,expires_at TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_product_licenses_store ON product_licenses(store_id,created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_store_status ON tickets(store_id,status,created_at);
