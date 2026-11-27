import {botIdentityForStore} from "./custom-bots.js";
import {pixPayload,qrGif} from "./pix-qr.js";
import {deliver} from "./payment-webhook.js";
import {announceSale} from "./sale-notifications.js";
export async function cart(interaction,env){
 const reply=(content,components=[])=>({type:4,data:{content,components,flags:64,allowed_mentions:{parse:[]}}});
 const custom=interaction.data?.custom_id||"";
 let action=["buy:","pick:","choose:","checkout:","close:","confirm-sale:","confirm-pix:"].find(x=>custom.startsWith(x));
 if(!action)return null;
 let ref=custom.slice(action.length);
 if(action==="pick:"){ref=String(interaction.data?.values?.[0]||"");}
 const variantRef=["pick:","checkout:"].includes(action)?await env.DB.prepare("SELECT product_id FROM variants WHERE id=?").bind(ref).first():null;
 const productId=variantRef?.product_id||ref;
 const p=await env.DB.prepare("SELECT p.*,s.guild_id,s.owner_id,u.discord_id AS owner_discord FROM products p JOIN stores s ON s.id=p.store_id JOIN users u ON u.id=s.owner_id WHERE p.id=? AND p.status='active'").bind(productId).first();
 const opening=["buy:","pick:"].includes(action);
 if(!p||p.guild_id!==interaction.guild_id||(opening&&(p.channel_id!==interaction.channel_id||p.message_id!==interaction.message?.id)))return reply("Produto indisponível.");
 const actor=interaction.member?.user?.id||interaction.user?.id;
 if(!actor)return reply("Não foi possível identificar sua conta.");
 const bot=await botIdentityForStore(env,p.store_id);
 if(!bot.token||String(bot.id)!==String(interaction.application_id))return reply("Bot da loja indisponível.");
 const call=(path,method="GET",body)=>fetch("https://discord.com/api/v10"+path,{method,headers:{Authorization:"Bot "+bot.token,...(body instanceof FormData?{}:{"Content-Type":"application/json"})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
 let buyer=actor,privateChannel=null,chosen=variantRef?ref:null;
 const validChannel=(channel,customer)=>{const o=channel.permission_overwrites||[];return channel.guild_id===p.guild_id&&channel.type===0&&o.some(x=>x.id===p.guild_id&&x.type===0&&(BigInt(x.deny)&1024n)!==0n)&&!o.some(x=>![customer,bot.id,p.owner_discord].includes(x.id)&&(BigInt(x.allow)&1024n)!==0n);};
 if(!opening){
  const res=await call("/channels/"+interaction.channel_id);
  if(!res.ok)return reply("Carrinho não encontrado.");
  const channel=await res.json(),parts=String(channel.topic||"").split(":");
  if(parts[0]!=="ZYNOX_CART"||parts[1]!==p.id||!/^\d{17,20}$/.test(parts[2]||""))return reply("Carrinho inválido.");
  buyer=parts[2];chosen=parts[3]||null;privateChannel=channel.id;
  if(!validChannel(channel,buyer))return reply("As permissões do carrinho foram alteradas.");
  const owner=actor===p.owner_discord;
  if(["confirm-sale:","confirm-pix:"].includes(action)){if(!owner)return reply("Somente o dono autorizado da loja pode confirmar a venda.");}
  else if(actor!==buyer&&!(action==="close:"&&owner))return reply("Este carrinho não pertence a você.");
  if(action==="checkout:"&&chosen&&chosen!==ref)return reply("Variação não pertence ao carrinho.");
  const orderId="cart:"+privateChannel;
  if(action==="close:"){
   const order=await env.DB.prepare("SELECT status FROM orders WHERE id=? AND store_id=?").bind(orderId,p.store_id).first();
   // Closing the Discord channel never cancels a bank payment or releases its stock.
   // Pending and paid orders remain available in the authenticated sales panel.
   const deleted=await call("/channels/"+privateChannel,"DELETE");return reply(deleted.ok?(order&&["pending","paid","delivering"].includes(order.status)?"Carrinho fechado. O pedido permanece no histórico para conferência e entrega.":"Carrinho fechado."):"Não foi possível fechar o carrinho.");
  }
  if(action==="confirm-sale:"){
   const row=await env.DB.prepare("SELECT m.status,o.status AS order_status FROM manual_pix_orders m JOIN orders o ON o.id=m.order_id WHERE m.order_id=? AND m.store_id=?").bind(orderId,p.store_id).first();
   if(!row||row.status!=="pending"||row.order_status!=="pending")return reply("Pedido não está aguardando confirmação.");
   return {type:9,data:{custom_id:"confirm-pix:"+p.id,title:"Confirmar recebimento Pix",components:[{type:1,components:[{type:4,custom_id:"reference",label:"EndToEndId do crédito no extrato",style:1,required:true,min_length:32,max_length:32}]}]}};
  }
  if(action==="confirm-pix:"){
   const reference=String(interaction.data?.components?.flatMap(x=>x.components||[]).find(x=>x.custom_id==="reference")?.value||"").trim();
   if(!/^E[0-9A-Za-z]{31}$/.test(reference))return reply("Informe o EndToEndId real do crédito conferido no extrato.");
   const row=await env.DB.prepare("SELECT m.status,o.status AS order_status,m.amount_cents,o.total_cents FROM manual_pix_orders m JOIN orders o ON o.id=m.order_id WHERE m.order_id=? AND m.store_id=?").bind(orderId,p.store_id).first();
   if(!row||row.status!=="pending"||row.order_status!=="pending"||row.amount_cents!==row.total_cents)return reply("Pedido indisponível para confirmação.");
   let result;try{result=await env.DB.batch([env.DB.prepare("UPDATE manual_pix_orders SET status='confirmed',confirmed_by=?,bank_reference=?,confirmed_at=datetime('now') WHERE order_id=? AND store_id=? AND status='pending' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='pending')").bind(p.owner_id,reference,orderId,p.store_id,orderId),env.DB.prepare("UPDATE orders SET status='paid',paid_at=datetime('now') WHERE id=? AND store_id=? AND status='pending' AND EXISTS(SELECT 1 FROM manual_pix_orders WHERE order_id=? AND status='confirmed' AND bank_reference=?)").bind(orderId,p.store_id,orderId,reference)]);}catch{return reply("Referência já utilizada ou confirmação indisponível.");}
   if(!result[0].meta.changes)return reply("Pedido já processado.");
   let delivery="pending";try{delivery=await deliver(env,orderId);}catch{}try{await announceSale(env,orderId);}catch{}
   await call("/channels/"+privateChannel+"/messages","POST",{content:delivery==="delivered"?"Pagamento confirmado. Produto enviado na DM do comprador.":"Pagamento confirmado. Entrega pendente de revisão.",allowed_mentions:{parse:[]}});
   return reply(delivery==="delivered"?"Venda confirmada e entregue.":"Venda confirmada. Confira a entrega no painel.");
  }
 }
 await env.DB.batch([
  env.DB.prepare("UPDATE orders SET status='expired' WHERE store_id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM payments WHERE order_id=orders.id) AND NOT EXISTS(SELECT 1 FROM manual_pix_orders WHERE order_id=orders.id AND status IN ('pending','confirmed')) AND datetime(created_at,'+10 minutes')<=datetime('now')").bind(p.store_id),
  env.DB.prepare("UPDATE stock SET status='available',reserved_until=NULL WHERE status='reserved' AND reserved_until<=datetime('now') AND variant_id IN (SELECT id FROM variants WHERE product_id=?) AND NOT EXISTS(SELECT 1 FROM order_stock os JOIN orders o ON o.id=os.order_id WHERE os.stock_id=stock.id AND o.status IN ('pending','paid'))").bind(productId)
 ]);
 const variants=(await env.DB.prepare("SELECT v.*,(SELECT count(*) FROM stock WHERE variant_id=v.id AND status='available') AS available FROM variants v WHERE product_id=?").bind(productId).all()).results;
 const available=variants.filter(v=>v.available>0);
 if(!available.length)return reply("Produto sem estoque.");
 const money=cents=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
 const cartEmbed=variant=>({author:{name:"CHECKOUT • COMPRA PRIVADA"},title:"🛒 "+p.name,description:String(p.description||"Produto digital").slice(0,4000),color:parseInt(String(p.color||"#7C3AED").slice(1),16)||0x7c3aed,fields:[{name:"Produto",value:variant?.name||"Escolha uma opção",inline:true},{name:"Total",value:variant?money(variant.price_cents):"A definir",inline:true},{name:"Entrega digital",value:"Após confirmação do pagamento."}],...(p.image_url?{thumbnail:{url:p.image_url}}:{}),footer:{text:"01 • Carrinho  →  02 • Pagamento  →  03 • Entrega"}});
 const controls=variant=>[{type:1,components:[{type:2,style:3,label:"Comprar",emoji:{name:"🛒"},custom_id:"checkout:"+variant.id},{type:2,style:4,label:"Fechar carrinho",emoji:{name:"✖️"},custom_id:"close:"+p.id}]}];
 const publish=async(embed,components=[],payload=null)=>{
  let body={embeds:[embed],components,allowed_mentions:{parse:[]}};
  if(payload){const form=new FormData();body.attachments=[{id:0,filename:"pix.gif"}];body.embeds[0].image={url:"attachment://pix.gif"};form.append("payload_json",JSON.stringify(body));form.append("files[0]",new Blob([qrGif(payload)],{type:"image/gif"}),"pix.gif");body=form;}
  const response=await call("/channels/"+privateChannel+"/messages","POST",body);
  return response.ok?reply("Carrinho: <#"+privateChannel+">"):reply("Não foi possível enviar a mensagem ao carrinho.");
 };
 if(opening){
  const selected=action==="pick:"?available.find(v=>v.id===ref):variants.length===1?available[0]:null;
  if(action==="pick:"&&!selected)return reply("Variação indisponível.");
  const topic="ZYNOX_CART:"+p.id+":"+buyer+(selected?":"+selected.id:"");
  const channels=await call("/guilds/"+p.guild_id+"/channels");if(!channels.ok)return reply("Não foi possível consultar os canais de compra.");
  const existing=(await channels.json()).find(ch=>ch.topic===topic&&validChannel(ch,buyer));
  if(existing)return reply("Seu carrinho já está aberto: <#"+existing.id+">");
  const overwrites=[{id:p.guild_id,type:0,deny:"1024",allow:"0"},{id:buyer,type:1,allow:"68608",deny:"0"},{id:bot.id,type:1,allow:"68608",deny:"0"}];
  if(p.owner_discord&&p.owner_discord!==buyer&&p.owner_discord!==bot.id)overwrites.push({id:p.owner_discord,type:1,allow:"68608",deny:"0"});
  const created=await call("/guilds/"+p.guild_id+"/channels","POST",{name:"carrinho-"+buyer.slice(-8),type:0,topic,permission_overwrites:overwrites});
  if(!created.ok)return reply("Não foi possível criar o carrinho privado. Confira Gerenciar Canais (HTTP "+created.status+").");
  privateChannel=(await created.json()).id;
  const embed=cartEmbed(selected);
  if(selected)return publish(embed,controls(selected));
  return publish(embed,[{type:1,components:[{type:3,custom_id:"choose:"+p.id,placeholder:"Selecione a variação",options:available.slice(0,25).map(v=>({label:v.name,value:v.id,description:money(v.price_cents)}))}]},{type:1,components:[{type:2,style:4,label:"Fechar carrinho",emoji:{name:"✖️"},custom_id:"close:"+p.id}]}]);
 }
 if(action==="choose:"){const selected=available.find(v=>v.id===interaction.data?.values?.[0]);if(!selected)return reply("Variação indisponível.");return publish(cartEmbed(selected),controls(selected));}

 if(action==="checkout:"){
  const v=available.find(v=>v.id===ref);
  if(!v)return reply("Variação indisponível.");
  const discordId=interaction.member?.user?.id||interaction.user?.id,username=interaction.member?.user?.username||interaction.user?.username||"Cliente";
  if(!discordId)return reply("Não foi possível identificar sua conta Discord.");
  await env.DB.prepare("INSERT INTO customers(id,store_id,discord_id,username) VALUES(?,?,?,?) ON CONFLICT(store_id,discord_id) DO UPDATE SET username=excluded.username").bind(crypto.randomUUID(),p.store_id,discordId,username).run();
  const customer=await env.DB.prepare("SELECT id FROM customers WHERE store_id=? AND discord_id=?").bind(p.store_id,discordId).first();
  const orderId="cart:"+privateChannel;
  const db=env.DB;
  const pix=await db.prepare("SELECT bank,key_type,pix_key,recipient,merchant_city FROM manual_pix_settings WHERE store_id=? AND enabled=1").bind(p.store_id).first();
  if(!pix)return reply("Pix ainda não configurado. O dono precisa cadastrar a chave e o titular.");
  let payload=null;if(pix.merchant_city){try{payload=pixPayload({key:pix.pix_key,recipient:pix.recipient,city:pix.merchant_city,cents:v.price_cents});}catch{}}
  const prior=await db.prepare("SELECT status FROM orders WHERE id=? AND store_id=?").bind(orderId,p.store_id).first();if(prior)return reply("Este carrinho já possui um pedido. Confira as mensagens.");
  await db.batch([
   db.prepare("INSERT OR IGNORE INTO orders(id,store_id,customer_id,variant_id,quantity,total_cents,status) SELECT ?,?,?,v.id,1,v.price_cents,'pending' FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND p.store_id=? AND p.status='active' AND EXISTS(SELECT 1 FROM stock WHERE variant_id=v.id AND status='available')").bind(orderId,p.store_id,customer.id,v.id,p.store_id),
   db.prepare("INSERT OR IGNORE INTO order_stock(order_id,stock_id) SELECT o.id,s.id FROM orders o JOIN stock s ON s.variant_id=o.variant_id WHERE o.id=? AND o.status='pending' AND s.status='available' AND NOT EXISTS(SELECT 1 FROM order_stock WHERE order_id=o.id) ORDER BY s.created_at,s.id LIMIT 1").bind(orderId),
   db.prepare("UPDATE stock SET status='reserved',reserved_until=datetime('now','+10 minutes') WHERE id IN (SELECT os.stock_id FROM order_stock os JOIN orders o ON o.id=os.order_id JOIN variants v ON v.id=o.variant_id WHERE o.id=? AND o.status='pending' AND v.infinite_stock=0) AND status='available'").bind(orderId)
  ]);
  const order=await db.prepare("SELECT o.id,o.total_cents FROM orders o JOIN order_stock os ON os.order_id=o.id JOIN variants v ON v.id=o.variant_id JOIN stock st ON st.id=os.stock_id AND ((v.infinite_stock=0 AND st.status='reserved' AND st.reserved_until>datetime('now')) OR (v.infinite_stock=1 AND st.status='available')) WHERE o.id=? AND o.customer_id=? AND o.status='pending'").bind(orderId,customer.id).first();
  if(!order)return reply("Estoque indisponível ou pedido expirado.");

  if(pix){
   await db.batch([
    db.prepare("INSERT OR IGNORE INTO manual_pix_orders(order_id,store_id,amount_cents) SELECT id,store_id,total_cents FROM orders WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM payments WHERE order_id=orders.id)").bind(orderId),
    db.prepare("UPDATE stock SET reserved_until=datetime('now','+24 hours') WHERE status='reserved' AND id IN (SELECT stock_id FROM order_stock WHERE order_id=?) AND EXISTS(SELECT 1 FROM manual_pix_orders WHERE order_id=? AND status='pending')").bind(orderId,orderId)
   ]);
   const manual=await db.prepare("SELECT status FROM manual_pix_orders WHERE order_id=?").bind(orderId).first();
   if(!manual||manual.status!=="pending")return reply("Pedido indisponível.");
   const paymentEmbed={author:{name:"CHECKOUT • PAGAMENTO"},title:"💠 Pague com Pix",color:0x14b8a6,description:"Abra o aplicativo do seu banco e confira o nome do destinatário e o valor antes de pagar.",fields:[{name:"Total a pagar",value:"**"+money(order.total_cents)+"**",inline:true},{name:"Titular",value:pix.recipient,inline:true},{name:"Produto",value:p.name.slice(0,256)+" • "+v.name},{name:payload?"Pix copia e cola":"Chave Pix ("+pix.key_type+")",value:"`"+(payload||pix.pix_key)+"`"},{name:"Status",value:"⏳ Aguardando confirmação do pagamento"},{name:"Pedido",value:orderId}],footer:{text:payload?"02 • Pagamento  →  03 • Entrega":"Pix por chave • QR indisponível sem cidade cadastrada"}};
   return publish(paymentEmbed,[{type:1,components:[{type:2,style:3,label:"Confirmar venda",emoji:{name:"✅"},custom_id:"confirm-sale:"+p.id},{type:2,style:4,label:"Fechar carrinho",emoji:{name:"✖️"},custom_id:"close:"+p.id}]}],payload);
  }
  return reply("Pagamento indisponível.");
 }
 return reply("Interação indisponível.");
}
