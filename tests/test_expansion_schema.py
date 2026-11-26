import sqlite3,unittest,pathlib
class ExpansionSchemaTest(unittest.TestCase):
 def test_migration(self):
  db=sqlite3.connect(":memory:")
  root=pathlib.Path(__file__).resolve().parents[1]
  db.executescript((root/"schema.sql").read_text())
  db.executescript((root/"migrations/0012_storefront_tickets_product_licenses.sql").read_text())
  db.executescript((root/"migrations/0012_storefront_tickets_product_licenses.sql").read_text())
  self.assertEqual(db.execute("SELECT count(*) FROM product_licenses").fetchone()[0],0)
