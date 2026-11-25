CREATE TABLE IF NOT EXISTS manual_pix_settings (
 store_id TEXT PRIMARY KEY REFERENCES stores(id),
 bank TEXT NOT NULL CHECK(bank IN ('nubank','picpay','itau','other')),
 key_type TEXT NOT NULL CHECK(key_type IN ('CPF','CNPJ','EMAIL','PHONE','EVP')),
 pix_key TEXT NOT NULL,
 recipient TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS manual_pix_orders (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 store_id TEXT NOT NULL REFERENCES stores(id),
 amount_cents INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled')),
 confirmed_by TEXT REFERENCES users(id),
 bank_reference TEXT UNIQUE,
 confirmed_at TEXT
);
