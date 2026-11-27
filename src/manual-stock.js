// D1 batch is atomic: assign a stock item only when confirming payment.
export async function confirmManual(env,{orderId,storeId,ownerId,reference=null}){
 const db=env.DB;
 const eligible="SELECT o.id FROM orders o JOIN manual_pix_orders m ON m.order_id=o.id WHERE o.id=? AND o.store_id=? AND o.status='pending' AND m.status='pending' AND m.amount_cents=o.total_cents";
 const results=await db.batch([
 db.prepare("DELETE FROM order_stock WHERE order_id IN ("+eligible+")").bind(orderId,storeId),
 db.prepare("INSERT INTO order_stock(order_id,stock_id) SELECT o.id,s.id FROM orders o JOIN variants v ON v.id=o.variant_id JOIN stock s ON s.variant_id=v.id WHERE o.id IN ("+eligible+") AND s.status='available' ORDER BY s.created_at,s.id LIMIT 1").bind(orderId,storeId),
 db.prepare("UPDATE manual_pix_orders SET status='confirmed',confirmed_by=?,bank_reference=?,confirmed_at=datetime('now') WHERE order_id IN ("+eligible+") AND EXISTS(SELECT 1 FROM order_stock WHERE order_id=manual_pix_orders.order_id)").bind(ownerId,reference,orderId,storeId),
 db.prepare("UPDATE stock SET status='sold',reserved_until=NULL WHERE status='available' AND id IN (SELECT os.stock_id FROM order_stock os JOIN orders o ON o.id=os.order_id JOIN variants v ON v.id=o.variant_id JOIN manual_pix_orders m ON m.order_id=o.id WHERE o.id=? AND o.store_id=? AND o.status='pending' AND m.status='confirmed' AND v.infinite_stock=0)").bind(orderId,storeId),
 db.prepare("UPDATE orders SET status='paid',paid_at=datetime('now') WHERE id=? AND store_id=? AND status='pending' AND EXISTS(SELECT 1 FROM manual_pix_orders m WHERE m.order_id=orders.id AND m.status='confirmed') AND EXISTS(SELECT 1 FROM order_stock WHERE order_id=orders.id)").bind(orderId,storeId)
 ]);
 return Boolean(results[4].meta.changes);
}
export async function releaseLegacyManual(env,storeId){
 // Keep historical orders; release only unpaid manual reservations, never gateway or paid stock.
 await env.DB.batch([
 env.DB.prepare("UPDATE stock SET status='available',reserved_until=NULL WHERE status='reserved' AND EXISTS(SELECT 1 FROM order_stock os JOIN orders o ON o.id=os.order_id JOIN manual_pix_orders m ON m.order_id=o.id WHERE os.stock_id=stock.id AND o.store_id=? AND o.status='pending' AND m.status='pending') AND NOT EXISTS(SELECT 1 FROM order_stock os JOIN orders o ON o.id=os.order_id WHERE os.stock_id=stock.id AND (o.status IN ('paid','delivering','delivered') OR EXISTS(SELECT 1 FROM payments pay WHERE pay.order_id=o.id)))").bind(storeId),
 env.DB.prepare("DELETE FROM order_stock WHERE order_id IN (SELECT o.id FROM orders o JOIN manual_pix_orders m ON m.order_id=o.id WHERE o.store_id=? AND o.status='pending' AND m.status='pending') AND stock_id IN (SELECT id FROM stock WHERE status='available')").bind(storeId)
 ]);
}
