import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class WalletSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript((ROOT / "schema.sql").read_text())
        self.db.execute(
            "INSERT INTO users(id, username, role) VALUES('u1','owner','owner')"
        )
        self.db.execute(
            "INSERT INTO stores(id, owner_id, name, guild_id) VALUES('s1','u1','Loja teste','g1')"
        )

    def tearDown(self):
        self.db.close()

    def test_verified_sale_credits_wallet_once(self):
        row = ("tx1", "s1", "sale", 2500, "payment:p1", "completed", "Venda teste")
        self.db.execute(
            "INSERT INTO wallet_transactions(id,store_id,type,amount_cents,external_reference,status,description) VALUES(?,?,?,?,?,?,?)",
            row,
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO wallet_transactions(id,store_id,type,amount_cents,external_reference,status,description) VALUES(?,?,?,?,?,?,?)",
                ("tx2", "s1", "sale", 2500, "payment:p1", "completed", "Duplicado"),
            )
        balance = self.db.execute(
            "SELECT COALESCE(SUM(CASE WHEN type IN ('sale','deposit','refund') AND status='completed' THEN amount_cents WHEN type IN ('withdrawal','fee') AND status='completed' THEN -amount_cents ELSE 0 END),0) FROM wallet_transactions WHERE store_id='s1'"
        ).fetchone()[0]
        self.assertEqual(balance, 2500)

    def test_pending_withdrawal_reduces_available_not_settled_balance(self):
        self.db.executemany(
            "INSERT INTO wallet_transactions(id,store_id,type,amount_cents,external_reference,status) VALUES(?,?,?,?,?,?)",
            [
                ("sale1", "s1", "sale", 10000, "payment:p2", "completed"),
                ("wd1", "s1", "withdrawal", 3000, "withdrawal:w1", "pending"),
            ],
        )
        settled = self.db.execute(
            "SELECT COALESCE(SUM(CASE WHEN type IN ('sale','deposit','refund') AND status='completed' THEN amount_cents WHEN type IN ('withdrawal','fee') AND status='completed' THEN -amount_cents ELSE 0 END),0) FROM wallet_transactions WHERE store_id='s1'"
        ).fetchone()[0]
        pending = self.db.execute(
            "SELECT COALESCE(SUM(amount_cents),0) FROM wallet_transactions WHERE store_id='s1' AND type='withdrawal' AND status='pending'"
        ).fetchone()[0]
        self.assertEqual(settled, 10000)
        self.assertEqual(settled - pending, 7000)

    def test_schema_has_unique_wallet_external_reference(self):
        indexes = {
            row[1] for row in self.db.execute("PRAGMA index_list(wallet_transactions)")
        }
        self.assertIn("idx_wallet_external_reference", indexes)

if __name__ == "__main__":
    unittest.main()
