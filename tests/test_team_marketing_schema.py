import sqlite3,unittest,pathlib
class TeamMarketingSchemaTest(unittest.TestCase):
 def test_schema(self):
  db=sqlite3.connect(":memory:")
  root=pathlib.Path(__file__).resolve().parents[1]
  db.executescript((root/"schema.sql").read_text())
  migration=(root/"migrations/0013_branding_staff_crm_marketing.sql").read_text()
  db.executescript(migration)
  db.executescript(migration)
  for table in ("store_branding","store_staff","marketing_campaigns"):
   self.assertEqual(db.execute("SELECT count(*) FROM "+table).fetchone()[0],0)
