CREATE TABLE IF NOT EXISTS server_controls (
 store_id TEXT PRIMARY KEY REFERENCES stores(id),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 enabled_since TEXT DEFAULT CURRENT_TIMESTAMP,
 removed_at TEXT
);
