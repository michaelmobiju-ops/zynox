CREATE TABLE IF NOT EXISTS sale_notifications (
 store_id TEXT PRIMARY KEY REFERENCES stores(id),
 channel_id TEXT NOT NULL,
 template TEXT NOT NULL DEFAULT 'classic' CHECK(template IN ('classic','compact','premium')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
