PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE,
  username TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'subscriber'
    CHECK(role IN ('owner', 'admin', 'subscriber')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  starts_at TEXT,
  expires_at TEXT,
  lifetime INTEGER DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  duration INTEGER,
  duration_unit TEXT,
  lifetime INTEGER DEFAULT 0,
  status TEXT DEFAULT 'available',
  created_by TEXT NOT NULL,
  redeemed_by TEXT,
  redeemed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(redeemed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  guild_id TEXT NOT NULL UNIQUE,
  wallet_enabled INTEGER NOT NULL DEFAULT 0 CHECK(wallet_enabled IN (0,1)),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  color TEXT DEFAULT '#7135FF',
  button_text TEXT DEFAULT 'Comprar',
  has_variations INTEGER DEFAULT 0,
  channel_id TEXT,
  message_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL
    CHECK(price_cents >= 0),
  infinite_stock INTEGER DEFAULT 0,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS stock (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  key_encrypted TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  status TEXT DEFAULT 'available',
  reserved_until TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(variant_id, key_fingerprint),
  FOREIGN KEY(variant_id) REFERENCES variants(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, discord_id),
  FOREIGN KEY(store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1
    CHECK(quantity > 0),
  total_cents INTEGER NOT NULL
    CHECK(total_cents >= 0),
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  delivered_at TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(variant_id) REFERENCES variants(id)
);

CREATE TABLE IF NOT EXISTS order_stock (
  order_id TEXT NOT NULL,
  stock_id TEXT NOT NULL,
  PRIMARY KEY(order_id, stock_id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(stock_id) REFERENCES stock(id)
);

CREATE TABLE IF NOT EXISTS gateways (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  credentials_encrypted TEXT,
  is_primary INTEGER DEFAULT 0,
  status TEXT DEFAULT 'disconnected',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  gateway_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  pix_code TEXT,
  qr_code TEXT,
  status TEXT DEFAULT 'pending',
  expires_at TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gateway_id, external_id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(gateway_id) REFERENCES gateways(id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  code TEXT NOT NULL,
  discount INTEGER NOT NULL
    CHECK(discount BETWEEN 1 AND 100),
  max_uses INTEGER,
  uses INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  expires_at TEXT,
  UNIQUE(store_id, code),
  FOREIGN KEY(store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  external_reference TEXT,
  status TEXT DEFAULT 'pending',
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  customer_id TEXT,
  subject TEXT,
  channel_id TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(store_id) REFERENCES stores(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_products_store
ON products(store_id);

CREATE INDEX IF NOT EXISTS idx_stock_variant
ON stock(variant_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_store
ON orders(store_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_order
ON payments(order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_primary_gateway
ON gateways(store_id)
WHERE is_primary = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_external_reference
ON wallet_transactions(store_id, external_reference)
WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_requests(user_id,status);

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

CREATE TABLE IF NOT EXISTS server_controls (
 store_id TEXT PRIMARY KEY REFERENCES stores(id),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 enabled_since TEXT DEFAULT CURRENT_TIMESTAMP,
 removed_at TEXT
);

CREATE TABLE IF NOT EXISTS sale_notifications (
 store_id TEXT PRIMARY KEY REFERENCES stores(id),
 channel_id TEXT NOT NULL,
 template TEXT NOT NULL DEFAULT 'classic' CHECK(template IN ('classic','compact','premium')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
