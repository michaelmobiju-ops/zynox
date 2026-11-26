import unittest,sqlite3
class StockSummaryTest(unittest.TestCase):
 def test_tenant_scope_and_counts(self):
  db=sqlite3.connect(":memory:")
  db.executescript("CREATE TABLE products(id,name,store_id,status);CREATE TABLE variants(id,product_id,name,infinite_stock);CREATE TABLE stock(variant_id,status);INSERT INTO products VALUES('p','A','a','active'),('q','B','b','active');INSERT INTO variants VALUES('v','p','A',0),('w','q','B',0);INSERT INTO stock VALUES('v','available'),('v','reserved'),('w','available');")
  sql="SELECT p.id AS product_id,p.name AS product_name,v.id AS variant_id,v.name AS variant_name,v.infinite_stock,COUNT(CASE WHEN s.status='available' THEN 1 END) AS available,COUNT(CASE WHEN s.status='reserved' THEN 1 END) AS reserved,COUNT(CASE WHEN s.status='used' THEN 1 END) AS used FROM products p JOIN variants v ON v.product_id=p.id LEFT JOIN stock s ON s.variant_id=v.id WHERE p.store_id=? AND p.status!='archived' GROUP BY p.id,v.id ORDER BY p.name,v.name"
  rows=db.execute(sql,('a',)).fetchall()
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0][5:],(1,1,0))
