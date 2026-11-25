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
 await env.DB.prepare("UPDATE orders SET status='expired' WHERE store_id=? AND status='pending' AND id IN (SELECT order_id FROM order_stock WHERE stock_id IN (SELECT id FROM stock WHERE status='reserved' AND reserved_until<=datetime('now')))").bind(p.store_id).run();
 await env.DB.prepare("UPDATE stock SET status='available',reserved_until=NULL WHERE status='reserved' AND reserved_until<=datetime('now') AND variant_id IN (SELECT id FROM variants WHERE product_id=?)").bind(productId).run();
 const variants=(await env.DB.prepare("SELECT v.*,(SELECT count(*) FROM stock WHERE variant_id=v.id AND status='available') AS available FROM variants v WHERE product_id=?").bind(productId).all()).results;
 const available=variants.filter(v=>v.infinite_stock||v.available>0);
 if(!available.length)return reply("Produto sem estoque.");
 if(action==="checkout:"){
  const v=available.find(v=>v.id===ref);
  if(!v)return reply("Variação indisponível.");
  const discordId=interaction.member?.user?.id||interaction.user?.id,username=interaction.member?.user?.username||interaction.user?.username||"Cliente";
  if(!discordId)return reply("Não foi possível identificar sua conta Discord.");
  await env.DB.prepare("INSERT INTO customers(id,store_id,discord_id,username) VALUES(?,?,?,?) ON CONFLICT(store_id,discord_id) DO UPDATE SET username=excluded.username").bind(crypto.randomUUID(),p.store_id,discordId,username).run();
  const customer=await env.DB.prepare("SELECT id FROM customers WHERE store_id=? AND discord_id=?").bind(p.store_id,discordId).first();
  const orderId=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO orders(id,store_id,customer_id,variant_id,quantity,total_cents,status) VALUES(?,?,?,?,1,?,'pending')").bind(orderId,p.store_id,customer.id,v.id,v.price_cents).run();
  if(!v.infinite_stock){
   const reserved=await env.DB.prepare("UPDATE stock SET status='reserved',reserved_until=datetime('now','+10 minutes') WHERE id=(SELECT id FROM stock WHERE variant_id=? AND status='available' ORDER BY created_at LIMIT 1) AND status='available' RETURNING id").bind(v.id).first();
   if(!reserved){await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=?").bind(orderId).run();return reply("Estoque acabou antes da reserva.");}
   await env.DB.prepare("INSERT INTO order_stock(order_id,stock_id) VALUES(?,?)").bind(orderId,reserved.id).run();
  }
  return reply("Reserva criada por 10 minutos.\n"+p.name+" — "+v.name+"\nTotal: R$ "+(v.price_cents/100).toFixed(2)+"\nPedido: "+orderId+"\nPix ainda não configurado.");
 }
 if(action==="choose:"){
  const v=available.find(v=>v.id===interaction.data?.values?.[0]);
  if(!v)return reply("Variação indisponível.");
  return reply("Selecionado: "+p.name+" — "+v.name+"\nTotal: R$ "+(v.price_cents/100).toFixed(2),[{type:1,components:[{type:2,style:3,label:"Reservar por 10 minutos",custom_id:"checkout:"+v.id}]}]);
 }
 return reply("Carrinho privado — "+p.name+"\n"+available.map(v=>v.name+" — R$ "+(v.price_cents/100).toFixed(2)).join("\n"),[{type:1,components:[{type:3,custom_id:"choose:"+p.id,placeholder:"Selecione a variação",options:available.slice(0,25).map(v=>({label:v.name,value:v.id,description:"R$ "+(v.price_cents/100).toFixed(2)}))}]}]);
}
