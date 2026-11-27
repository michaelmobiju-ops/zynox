import {botIdentityForStore} from "./custom-bots.js";
export async function cart(interaction,env){
 const reply=(content,components=[])=>({type:4,data:{content,components,flags:64,allowed_mentions:{parse:[]}}});
 const custom=interaction.data?.custom_id||"";
 let action=["buy:","choose:","checkout:"].find(x=>custom.startsWith(x));
 if(!action)return null;
 let ref=custom.slice(action.length);
 const variantRef=action==="checkout:"?await env.DB.prepare("SELECT product_id FROM variants WHERE id=?").bind(ref).first():null;
 const productId=variantRef?.product_id||ref;
 const p=await env.DB.prepare("SELECT p.*,s.guild_id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND p.status='active'").bind(productId).first();
 if(!p||p.guild_id!==interaction.guild_id||(action==="buy:"&&(p.channel_id!==interaction.channel_id||p.message_id!==interaction.message?.id)))return reply("Produto indisponível.");
 const buyer=interaction.member?.user?.id||interaction.user?.id;
 if(!buyer)return reply("Não foi possível identificar o comprador.");
 const bot=await botIdentityForStore(env,p.store_id);
 if(!bot.token||String(bot.id)!==String(interaction.application_id))return reply("Bot da loja indisponível.");
 const call=(path,method="GET",body)=>fetch("https://discord.com/api/v10"+path,{method,headers:{Authorization:"Bot "+bot.token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
 const topic="ZYNOX_CART:"+p.id+":"+buyer;
 let privateChannel=null;
 if(action!=="buy:"){
  const res=await call("/channels/"+interaction.channel_id);
  if(!res.ok)return reply("Carrinho não encontrado.");
  const channel=await res.json();
  if(channel.guild_id!==p.guild_id||channel.topic!==topic||channel.type!==0)return reply("Este carrinho não pertence a você.");
  const overwrites=channel.permission_overwrites||[];
  if(!overwrites.some(o=>o.id===p.guild_id&&o.type===0&&(BigInt(o.deny)&1024n)!==0n)||overwrites.some(o=>o.id!==buyer&&o.id!==bot.id&&o.id!==p.guild_id&&(BigInt(o.allow)&1024n)!==0n))return reply("As permissões do carrinho foram alteradas.");
  privateChannel=channel.id;
 }

 await env.DB.batch([
  env.DB.prepare("UPDATE orders SET status='expired' WHERE store_id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM payments WHERE order_id=orders.id) AND NOT EXISTS(SELECT 1 FROM manual_pix_orders WHERE order_id=orders.id AND status IN ('pending','confirmed')) AND datetime(created_at,'+10 minutes')<=datetime('now')").bind(p.store_id),
  env.DB.prepare("UPDATE stock SET status='available',reserved_until=NULL WHERE status='reserved' AND reserved_until<=datetime('now') AND variant_id IN (SELECT id FROM variants WHERE product_id=?) AND NOT EXISTS(SELECT 1 FROM order_stock os JOIN orders o ON o.id=os.order_id WHERE os.stock_id=stock.id AND o.status IN ('pending','paid'))").bind(productId)
 ]);
 const variants=(await env.DB.prepare("SELECT v.*,(SELECT count(*) FROM stock WHERE variant_id=v.id AND status='available') AS available FROM variants v WHERE product_id=?").bind(productId).all()).results;
 const available=variants.filter(v=>v.available>0);
 if(!available.length)return reply("Produto sem estoque.");
 const money=cents=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
 const publish=async(content,components=[])=>{
  const response=await call("/channels/"+privateChannel+"/messages","POST",{content,components,allowed_mentions:{parse:[]}});
  return response.ok?reply("Confira seu carrinho: <#"+privateChannel+">"):reply("Não foi possível enviar a mensagem ao carrinho. Confira as permissões do bot.");
 };
 if(action==="buy:"){
  const channels=await call("/guilds/"+p.guild_id+"/channels");
  if(!channels.ok)return reply("Não foi possível consultar os canais de compra.");
  const existing=(await channels.json()).find(ch=>ch.type===0&&ch.topic===topic&&ch.permission_overwrites?.some(o=>o.id===p.guild_id&&o.type===0&&(BigInt(o.deny)&1024n)!==0n)&&!ch.permission_overwrites.some(o=>o.id!==buyer&&o.id!==bot.id&&o.id!==p.guild_id&&(BigInt(o.allow)&1024n)!==0n));
  if(existing)return reply("Seu carrinho já está aberto: <#"+existing.id+">");
  const created=await call("/guilds/"+p.guild_id+"/channels","POST",{name:"carrinho-"+buyer.slice(-8),type:0,topic,permission_overwrites:[{id:p.guild_id,type:0,deny:"1024",allow:"0"},{id:buyer,type:1,allow:"68608",deny:"0"},{id:bot.id,type:1,allow:"68608",deny:"0"}]});
  if(!created.ok)return reply("Não foi possível criar o carrinho privado. O bot precisa de Gerenciar Canais (HTTP "+created.status+").");
  privateChannel=(await created.json()).id;
  if(variants.length===1){action="checkout:";ref=available[0].id;}
  else return publish("**Carrinho de compras** — "+p.name,[{type:1,components:[{type:3,custom_id:"choose:"+p.id,placeholder:"Selecione a variação",options:available.slice(0,25).map(v=>({label:v.name,value:v.id,description:money(v.price_cents)}))}]}]);
 }
 if(action==="choose:"){action="checkout:";ref=String(interaction.data?.values?.[0]||"");}
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
  const order=await db.prepare("SELECT o.id,o.total_cents FROM orders o JOIN order_stock os ON os.order_id=o.id JOIN variants v ON v.id=o.variant_id JOIN stock st ON st.id=os.stock_id AND ((v.infinite_stock=0 AND st.status='reserved' AND st.reserved_until>datetime('now')) OR (v.infinite_stock=1 AND st.status='available')) WHERE o.id=? AND o.customer_id=? AND o.status='pending'").bind(orderId,customer.id).first();
  if(!order)return reply("Estoque indisponível ou pedido expirado.");
  const pix=await db.prepare("SELECT bank,key_type,pix_key,recipient FROM manual_pix_settings WHERE store_id=? AND enabled=1").bind(p.store_id).first();
  if(pix){
   await db.batch([
    db.prepare("INSERT OR IGNORE INTO manual_pix_orders(order_id,store_id,amount_cents) SELECT id,store_id,total_cents FROM orders WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM payments WHERE order_id=orders.id)").bind(orderId),
    db.prepare("UPDATE stock SET reserved_until=datetime('now','+24 hours') WHERE status='reserved' AND id IN (SELECT stock_id FROM order_stock WHERE order_id=?) AND EXISTS(SELECT 1 FROM manual_pix_orders WHERE order_id=? AND status='pending')").bind(orderId,orderId)
   ]);
   const manual=await db.prepare("SELECT status FROM manual_pix_orders WHERE order_id=?").bind(orderId).first();
   if(!manual||manual.status!=="pending")return reply("Pedido indisponível.");
   return publish("Pix manual — "+p.name+" / "+v.name+"\nValor: R$ "+(order.total_cents/100).toFixed(2)+"\nTitular: "+pix.recipient+"\nTipo: "+pix.key_type+"\nChave Pix: "+pix.pix_key+"\nPedido: "+orderId+"\nConfira o titular no aplicativo do banco. A entrega depende da confirmação do vendedor no extrato.");
  }
  return publish("**Pedido criado**\n"+p.name+" — "+v.name+"\nTotal: "+money(v.price_cents)+"\nPedido: "+orderId+"\nPix ainda não configurado. Nenhum pagamento foi solicitado.");
 }
 return reply("Interação indisponível.");
}
