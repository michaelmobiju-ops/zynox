export async function cart(interaction,env){
 const reply=(content,components=[])=>({type:4,data:{content,components,flags:64,allowed_mentions:{parse:[]}}});
 const custom=interaction.data?.custom_id||"";
 if(!custom.startsWith("buy:")&&!custom.startsWith("choose:"))return null;
 const choosing=custom.startsWith("choose:");
 const id=custom.slice(choosing?7:4);
 const p=await env.DB.prepare("SELECT p.*,s.guild_id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND p.status='active'").bind(id).first();
 if(!p||p.guild_id!==interaction.guild_id||p.channel_id!==interaction.channel_id||(!choosing&&p.message_id!==interaction.message?.id))return reply("Produto indisponível.");
 const variants=(await env.DB.prepare("SELECT v.*,(SELECT count(*) FROM stock WHERE variant_id=v.id AND status='available') AS available FROM variants v WHERE product_id=?").bind(id).all()).results;
 const available=variants.filter(v=>v.available>0);
 if(!available.length)return reply("Produto sem estoque.");
 if(custom.startsWith("checkout:")){
  const variantId=custom.slice(9);
  const v=available.find(v=>v.id===variantId);
  if(!v)return reply("Variação indisponível.");
  if(v.infinite_stock)return reply("Estoque infinito selecionado. O pagamento Pix ainda precisa ser configurado.");
  const customerId=crypto.randomUUID(),orderId=crypto.randomUUID(),discordId=interaction.member?.user?.id||interaction.user?.id,username=interaction.member?.user?.username||interaction.user?.username||"Cliente";
  if(!discordId)return reply("Não foi possível identificar sua conta Discord.");
  await env.DB.prepare("INSERT INTO customers(id,store_id,discord_id,username) VALUES(?,?,?,?) ON CONFLICT(store_id,discord_id) DO UPDATE SET username=excluded.username").bind(customerId,store.id,discordId,username).run();
  const customer=await env.DB.prepare("SELECT id FROM customers WHERE store_id=? AND discord_id=?").bind(store.id,discordId).first();
  await env.DB.prepare("INSERT INTO orders(id,store_id,customer_id,variant_id,quantity,total_cents,status) VALUES(?,?,?,?,1,?,'pending')").bind(orderId,store.id,customer.id,v.id,v.price_cents).run();
  const reserved=await env.DB.prepare("UPDATE stock SET status='reserved',reserved_until=datetime('now','+10 minutes') WHERE id=(SELECT id FROM stock WHERE variant_id=? AND status='available' ORDER BY created_at LIMIT 1) AND status='available' RETURNING id").bind(v.id).first();
  if(!reserved){await env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=?").bind(orderId).run();return reply("Estoque acabou antes da reserva. Atualize o anúncio.");}
  await env.DB.prepare("INSERT INTO order_stock(order_id,stock_id) VALUES(?,?)").bind(orderId,reserved.id).run();
  return reply("Reserva criada por 10 minutos.\nProduto: "+p.name+" — "+v.name+"\nTotal: R$ "+(v.price_cents/100).toFixed(2)+"\nPedido: "+orderId+"\nPagamento Pix ainda não configurado.");
 }
 if(choosing){
  const v=available.find(v=>v.id===interaction.data?.values?.[0]);
  if(!v)return reply("Variação indisponível.");
  return reply("Selecionado: "+p.name+" — "+v.name+"\nTotal: R$ "+(v.price_cents/100).toFixed(2),[{type:1,components:[{type:2,style:3,label:"Reservar por 10 minutos",custom_id:"checkout:"+v.id}]}]);
 }
 return reply("Carrinho privado — "+p.name+"\n"+available.map(v=>v.name+" — R$ "+(v.price_cents/100).toFixed(2)).join("\n")+"\nPagamento ainda indisponível. Nenhuma cobrança ou reserva foi realizada.",[{type:1,components:[{type:3,custom_id:"choose:"+p.id,placeholder:"Selecione a variação",options:available.slice(0,25).map(v=>({label:v.name,value:v.id,description:"R$ "+(v.price_cents/100).toFixed(2)}))}]}]);
}
