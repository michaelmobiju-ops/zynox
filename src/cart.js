export async function cart(interaction,env){
 const reply=(content,components=[])=>({type:4,data:{content,components,flags:64,allowed_mentions:{parse:[]}}});
 const custom=interaction.data?.custom_id||"";
 const action=["buy:","choose:","checkout:"].find(x=>custom.startsWith(x));
 if(!action)return null;
 const ref=custom.slice(action.length);
 const variantRef=action==="checkout:"?await env.DB.prepare("SELECT product_id FROM variants WHERE id=?").bind(ref).first():null;
 const productId=variantRef?.product_id||ref;
 const p=await env.DB.prepare("SELECT p.*,s.guild_id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND p.status='active'").bind(productId).first();
 if(!p||p.guild_id!==interaction.guild_id||p.channel_id!==interaction.channel_id||(action==="buy:"&&p.message_id!==interaction.message?.id))return reply("Produto indisponível.");
 await env.DB.batch([
  env.DB.prepare("UPDATE orders SET status='expired' WHERE store_id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM payments WHERE order_id=orders.id) AND datetime(created_at,'+10 minutes')<=datetime('now')").bind(p.store_id),
  env.DB.prepare("UPDATE stock SET status='available',reserved_until=NULL WHERE status='reserved' AND reserved_until<=datetime('now') AND variant_id IN (SELECT id FROM variants WHERE product_id=?) AND NOT EXISTS(SELECT 1 FROM order_stock os JOIN orders o ON o.id=os.order_id WHERE os.stock_id=stock.id AND o.status IN ('pending','paid'))").bind(productId)
 ]);
 const variants=(await env.DB.prepare("SELECT v.*,(SELECT count(*) FROM stock WHERE variant_id=v.id AND status='available') AS available FROM variants v WHERE product_id=?").bind(productId).all()).results;
 const available=variants.filter(v=>v.available>0);
 if(!available.length)return reply("Produto sem estoque.");
 if(action==="checkout:"){
  const v=available.find(v=>v.id===ref);
  if(!v)return reply("Variação indisponível.");
  const discordId=interaction.member?.user?.id||interaction.user?.id,username=interaction.member?.user?.username||interaction.user?.username||"Cliente";
  if(!discordId)return reply("Não foi possível identificar sua conta Discord.");
  await env.DB.prepare("INSERT INTO customers(id,store_id,discord_id,username) VALUES(?,?,?,?) ON CONFLICT(store_id,discord_id) DO UPDATE SET username=excluded.username").bind(crypto.randomUUID(),p.store_id,discordId,username).run();
  const customer=await env.DB.prepare("SELECT id FROM customers WHERE store_id=? AND discord_id=?").bind(p.store_id,discordId).first();
  const orderId="discord:"+interaction.id;
  const db=env.DB;
  await db.batch([
   db.prepare("INSERT OR IGNORE INTO orders(id,store_id,customer_id,variant_id,quantity,total_cents,status) SELECT ?,?,?,v.id,1,v.price_cents,'pending' FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND p.store_id=? AND p.status='active' AND EXISTS(SELECT 1 FROM stock WHERE variant_id=v.id AND status='available')").bind(orderId,p.store_id,customer.id,v.id,p.store_id),
   db.prepare("INSERT OR IGNORE INTO order_stock(order_id,stock_id) SELECT o.id,s.id FROM orders o JOIN stock s ON s.variant_id=o.variant_id WHERE o.id=? AND o.status='pending' AND s.status='available' AND NOT EXISTS(SELECT 1 FROM order_stock WHERE order_id=o.id) ORDER BY s.created_at,s.id LIMIT 1").bind(orderId),
   db.prepare("UPDATE stock SET status='reserved',reserved_until=datetime('now','+10 minutes') WHERE id IN (SELECT os.stock_id FROM order_stock os JOIN orders o ON o.id=os.order_id JOIN variants v ON v.id=o.variant_id WHERE o.id=? AND o.status='pending' AND v.infinite_stock=0) AND status='available'").bind(orderId)
  ]);
  const order=await db.prepare("SELECT o.id,o.total_cents FROM orders o JOIN order_stock os ON os.order_id=o.id JOIN stock st ON st.id=os.stock_id AND st.status='reserved' AND st.reserved_until>datetime('now') WHERE o.id=? AND o.customer_id=? AND o.status='pending'").bind(orderId,customer.id).first();
  if(!order)return reply("Estoque indisponível ou pedido expirado.");
  return reply("Reserva criada por 10 minutos.\n"+p.name+" — "+v.name+"\nTotal: R$ "+(v.price_cents/100).toFixed(2)+"\nPedido: "+orderId+"\nPix ainda não configurado.");
 }
 if(action==="choose:"){
  const v=available.find(v=>v.id===interaction.data?.values?.[0]);
  if(!v)return reply("Variação indisponível.");
  return reply("Selecionado: "+p.name+" — "+v.name+"\nTotal: R$ "+(v.price_cents/100).toFixed(2),[{type:1,components:[{type:2,style:3,label:"Reservar por 10 minutos",custom_id:"checkout:"+v.id}]}]);
 }
 return reply("Carrinho privado — "+p.name+"\n"+available.map(v=>v.name+" — R$ "+(v.price_cents/100).toFixed(2)).join("\n"),[{type:1,components:[{type:3,custom_id:"choose:"+p.id,placeholder:"Selecione a variação",options:available.slice(0,25).map(v=>({label:v.name,value:v.id,description:"R$ "+(v.price_cents/100).toFixed(2)}))}]}]);
}
