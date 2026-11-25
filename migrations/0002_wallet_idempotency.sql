CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_external_reference
ON wallet_transactions(store_id, external_reference)
WHERE external_reference IS NOT NULL;
