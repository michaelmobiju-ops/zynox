-- Existing D1 databases: run once before deploying the wallet opt-in feature.
ALTER TABLE stores ADD COLUMN wallet_enabled INTEGER NOT NULL DEFAULT 0 CHECK(wallet_enabled IN (0,1));
