CREATE TABLE IF NOT EXISTS ticket_panels (id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),channel_id TEXT NOT NULL,message_id TEXT,title TEXT NOT NULL,description TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('buttons','select')),options_json TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_ticket_panels_store ON ticket_panels(store_id);
