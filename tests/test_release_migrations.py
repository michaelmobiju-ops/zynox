import pathlib,sqlite3,unittest
class ReleaseMigrationTest(unittest.TestCase):
 def test_expansion_migrations(self):
  root=pathlib.Path(__file__).resolve().parents[1]
  db=sqlite3.connect(":memory:")
  db.executescript((root/"schema.sql").read_text())
  for pattern in ("0012_*","0013_*","0014_*"):
   for file in sorted((root/"migrations").glob(pattern)):
    db.executescript(file.read_text())
    db.executescript(file.read_text())
  self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0],"ok")
