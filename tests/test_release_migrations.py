import pathlib,sqlite3,unittest
class ReleaseMigrationTest(unittest.TestCase):
 def test_expansion_migrations(self):
  root=pathlib.Path(__file__).resolve().parents[1]
  db=sqlite3.connect(":memory:")
  db.executescript((root/"schema.sql").read_text())
  db.execute("INSERT INTO users(id,username) VALUES('u','test')")
  db.execute("INSERT INTO stores(id,owner_id,name,guild_id) VALUES('s','u','test','g')")
  db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('hash','u','2099-01-01')")
  db.commit()
  for number in range(11,16):
   files=list((root/"migrations").glob(f"{number:04d}_*.sql"))
   self.assertEqual(len(files),1)
   for file in files:
    db.executescript(file.read_text())
    db.executescript(file.read_text())
  self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0],"ok")
  self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(),[])
  self.assertEqual(db.execute("SELECT user_id FROM sessions WHERE token_hash='hash'").fetchone(),('u',))
  self.assertEqual(db.execute("SELECT owner_id FROM stores WHERE id='s'").fetchone(),('u',))
