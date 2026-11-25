import {deliver} from "./payment-webhook.js";
import {getSession} from "./auth.js";
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const fail=(error,status=400)=>json({error},status);
export async function commerce(request,env,storeChannels){
 const url=new URL(request.url),path=url.pathname;
 const user=await getSession(request,env);
 if(!user)return fail("Autenticação necessária.",401);
 if(user.role==="subscriber"&&!await env.DB.prepare("SELECT id FROM subscriptions WHERE user_id=? AND status='active' AND (lifetime=1 OR datetime(expires_at)>datetime('now'))").bind(user.id).first())return fail("Assinatura necessária.",403);
 if(request.method!=="GET"&&(request.method!=="POST"||request.headers.get("Origin")!==url.origin))return fail("Acesso negado.",403);
 let body={};if(request.method==="POST"){try{body=await request.json()}catch{return fail("Dados inválidos.");}}
 const store=await env.DB.prepare("SELECT * FROM stores WHERE id=? AND owner_id=?").bind(String(body.store_id||url.searchParams.get("store")||""),user.id).first();
 if(!store)return fail("Loja não encontrada.",404);
 const call=(p,opts={})=>fetch("https://discord.com/api/v10"+p,{...opts,headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN,"Content-Type":"application/json"},signal:AbortSignal.timeout(8000)});
 const list=async(sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;
 if(path==="/api/commerce/settings"&&request.method==="GET")return json({store:{id:store.id,name:store.name,guild_id:store.guild_id}});
 if(path==="/api/commerce/settings"&&request.method==="POST"){
  const name=typeof body.name==="string"?body.name.trim():"";
  if(!name||name.length>100)return fail("Informe um nome de loja com até 100 caracteres.");
  await env.DB.prepare("UPDATE stores SET name=? WHERE id=? AND owner_id=?").bind(name,store.id,user.id).run();
  return json({success:true,name});
 }
 if(path==="/api/commerce/automations"&&request.method==="GET"){
  const rows=await list("SELECT o.id,o.status,o.paid_at,o.delivered_at,p.name AS product_name FROM orders o JOIN variants v ON v.id=o.variant_id JOIN products p ON p.id=v.product_id WHERE o.store_id=? AND o.status IN ('paid','delivered') ORDER BY o.paid_at DESC LIMIT 50",store.id);
  return json({delivery:{configured:Boolean(env.DISCORD_BOT_TOKEN&&env.STOCK_ENCRYPTION_KEY),automatic:true,infinite_supported:false},payments:{sandbox_enabled:env.ENABLE_SANDBOX_PAYMENTS==="true"},rows});
 }
 if(path==="/api/commerce/integrations"&&request.method==="GET"){
  const gateways=await list("SELECT provider,status,is_primary FROM gateways WHERE store_id=?",store.id);
  return json({discord:{linked:true,guild_id:store.guild_id,bot_configured:Boolean(env.DISCORD_BOT_TOKEN)},gateways,features:{wallet:false,ai:false,real_payments:false}});
 }
 if(path==="/api/commerce/products"&&request.method==="GET")return json({products:await list("SELECT * FROM products WHERE store_id=? ORDER BY created_at DESC",store.id),variants:await list("SELECT v.*,(SELECT count(*) FROM stock s WHERE s.variant_id=v.id AND s.status='available') AS available FROM variants v JOIN products p ON p.id=v.product_id WHERE p.store_id=?",store.id)});
 if(path==="/api/commerce/products"&&request.method==="POST"){
  const name=String(body.name||"").trim(),description=String(body.description||""),image=String(body.image_url||""),color=String(body.color||"#7135FF"),button=String(body.button_text||"Comprar"),channel=String(body.channel_id||"");
  const variants=body.variants;
  if(!name||name.length>256||description.length>4096||image.length>2048||(image&&!/^https:\/\//i.test(image))||!/^#[0-9a-f]{6}$/i.test(color)||!button||button.length>80||!/^\d{17,20}$/.test(channel)||!Array.isArray(variants)||variants.length<1||variants.length>25||variants.some(v=>!v||typeof v.name!=="string"||!v.name.trim()||v.name.length>80||!Number.isSafeInteger(v.price_cents)||v.price_cents<1||v.price_cents>100000000))return fail("Dados do produto inválidos.");
  const check=await storeChannels(new Request(url.origin+"/api/store/channels?store="+encodeURIComponent(store.id),{headers:{Cookie:request.headers.get("Cookie")||""}}),env);
  if(!check.ok||!(await check.json()).channels?.some(c=>c.id===channel&&c.available))return fail("Canal não autorizado.",403);
  const id=crypto.randomUUID();
  await env.DB.batch([env.DB.prepare("INSERT INTO products(id,store_id,name,description,image_url,color,button_text,has_variations,channel_id,status) VALUES(?,?,?,?,?,?,?,?,?,'draft')").bind(id,store.id,name,description,image,color,button,body.has_variations?1:0,channel),...variants.map(v=>env.DB.prepare("INSERT INTO variants(id,product_id,name,price_cents) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,v.name.trim(),v.price_cents))]);
  return json({success:true,id},201);
 }
 if(path==="/api/commerce/stock/mode"&&request.method==="POST"){
  if(typeof body.infinite!=="boolean")return fail("Modo inválido.");
  const v=await env.DB.prepare("SELECT v.id FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND p.store_id=?").bind(String(body.variant_id||""),store.id).first();
  if(!v)return fail("Variação não encontrada.",404);
  const result=await env.DB.prepare("UPDATE variants SET infinite_stock=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM orders WHERE variant_id=? AND status IN ('pending','paid')) AND (?=0 OR ((SELECT count(*) FROM stock WHERE variant_id=? AND status='available')=1 AND NOT EXISTS(SELECT 1 FROM stock WHERE variant_id=? AND status='reserved')))").bind(body.infinite?1:0,v.id,v.id,body.infinite?1:0,v.id,v.id).run();
  if(!result.meta.changes)return fail("Estoque infinito exige exatamente uma key disponível e nenhum pedido pendente.",409);
  return json({success:true});
 }
 if(path==="/api/commerce/stock"&&request.method==="POST"){
  const v=await env.DB.prepare("SELECT v.id,v.infinite_stock FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND p.store_id=?").bind(String(body.variant_id||""),store.id).first();
  if(!v)return fail("Variação não encontrada.",404);
  if(v.infinite_stock)return fail("Desative o estoque infinito antes de adicionar keys.",409);
  if(!env.STOCK_ENCRYPTION_KEY||env.STOCK_ENCRYPTION_KEY.length<32)return fail("Configure STOCK_ENCRYPTION_KEY na Cloudflare.",503);
  if(typeof body.keys!=="string"||body.keys.length>50000)return fail("Estoque inválido.");
  const keys=[...new Set(body.keys.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
  if(!keys.length||keys.length>50||keys.some(k=>k.length>1000))return fail("Envie de 1 a 50 keys por vez.");
  const enc=new TextEncoder(),hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
  const material=await crypto.subtle.importKey("raw",enc.encode(env.STOCK_ENCRYPTION_KEY),"HKDF",false,["deriveKey"]);
  const derive=(info,algorithm,usages)=>crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:enc.encode("zynox-stock-v1"),info:enc.encode(info)},material,algorithm,false,usages);
  const key=await derive("encryption",{name:"AES-GCM",length:256},["encrypt"]);
  const mac=await derive("fingerprint",{name:"HMAC",hash:"SHA-256",length:256},["sign"]);
  const statements=[];
  for(const value of keys){
   const iv=crypto.getRandomValues(new Uint8Array(12));
   const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(v.id)},key,enc.encode(value));
   const fingerprint=hex(await crypto.subtle.sign("HMAC",mac,enc.encode(v.id+"\0"+value)));
   statements.push(env.DB.prepare("INSERT INTO stock(id,variant_id,key_encrypted,key_fingerprint) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM variants WHERE id=? AND infinite_stock=0) ON CONFLICT(variant_id,key_fingerprint) DO NOTHING").bind(crypto.randomUUID(),v.id,hex(iv)+":"+hex(encrypted),fingerprint,v.id));
  }
  const results=await env.DB.batch(statements);
  return json({success:true,added:results.reduce((n,x)=>n+x.meta.changes,0)});
 }
 if(path==="/api/commerce/publish"&&request.method==="POST"){
  const p=await env.DB.prepare("SELECT * FROM products WHERE id=? AND store_id=?").bind(String(body.product_id||""),store.id).first();
  if(!p)return fail("Produto não encontrado.",404);
  const check=await storeChannels(new Request(url.origin+"/api/store/channels?store="+encodeURIComponent(store.id),{headers:{Cookie:request.headers.get("Cookie")||""}}),env);
  if(!check.ok||!(await check.json()).channels?.some(c=>c.id===p.channel_id&&c.available))return fail("Canal não autorizado.",403);
  const embed={title:p.name,description:p.description||undefined,color:parseInt(p.color.slice(1),16),...(p.image_url?{image:{url:p.image_url}}:{})};
  const payload={embeds:[embed],allowed_mentions:{parse:[]},components:[{type:1,components:[{type:2,style:1,label:p.button_text,custom_id:"buy:"+p.id,disabled:false}]}]};
  const locked=await env.DB.prepare("UPDATE products SET status='publishing' WHERE id=? AND store_id=? AND status IN ('draft','active')").bind(p.id,store.id).run();
  if(!locked.meta.changes)return fail("Publicação em andamento ou requer revisão.",409);
  let response;
  try{response=await call("/channels/"+p.channel_id+"/messages"+(p.message_id?"/"+p.message_id:""),{method:p.message_id?"PATCH":"POST",body:JSON.stringify({...payload,...(!p.message_id?{nonce:p.id.replaceAll("-","").slice(0,25),enforce_nonce:true}:{})})});}catch{return fail("Resultado incerto; confira o Discord antes de repetir.",502);}
  if(!response.ok){await env.DB.prepare("UPDATE products SET status=? WHERE id=?").bind(p.status,p.id).run();return fail("Discord recusou a publicação.",502);}
  const message=await response.json();
  await env.DB.prepare("UPDATE products SET message_id=?,status='active' WHERE id=? AND store_id=?").bind(message.id,p.id,store.id).run();
  return json({success:true,message_id:message.id});
 }
 if(path==="/api/commerce/overview"&&request.method==="GET"){
  const orders=await list("SELECT o.id,o.status,o.total_cents,o.created_at,o.paid_at,o.delivered_at,c.username,p.name AS product_name,v.name AS variant_name FROM orders o JOIN customers c ON c.id=o.customer_id JOIN variants v ON v.id=o.variant_id JOIN products p ON p.id=v.product_id WHERE o.store_id=? ORDER BY o.created_at DESC LIMIT 100",store.id);
  const stats=await env.DB.prepare("SELECT count(*) AS orders,COALESCE(SUM(CASE WHEN status IN ('paid','delivered') THEN total_cents ELSE 0 END),0) AS sales_cents,COALESCE(SUM(CASE WHEN status IN ('paid','delivered') THEN 1 ELSE 0 END),0) AS paid,COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) AS pending,COALESCE(SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END),0) AS delivered FROM orders WHERE store_id=?").bind(store.id).first();
  const customers=await list("SELECT c.discord_id,c.username,c.created_at,count(o.id) AS orders,COALESCE(SUM(CASE WHEN o.status IN ('paid','delivered') THEN o.total_cents ELSE 0 END),0) AS spent_cents FROM customers c LEFT JOIN orders o ON o.customer_id=c.id AND o.store_id=c.store_id WHERE c.store_id=? GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100",store.id);
  const customerCount=await env.DB.prepare("SELECT count(*) AS total FROM customers WHERE store_id=?").bind(store.id).first();
  return json({orders,stats:{...stats,customers:customerCount.total},customers,coupons:await list("SELECT * FROM coupons WHERE store_id=?",store.id),wallet:[],gateways:await list("SELECT id,provider,status,is_primary FROM gateways WHERE store_id=?",store.id),tickets:await list("SELECT id,subject,status,created_at FROM tickets WHERE store_id=? ORDER BY created_at DESC LIMIT 100",store.id)});
 }
 if(path==="/api/commerce/manual-pix"&&request.method==="GET"){
  const settings=await env.DB.prepare("SELECT bank,key_type,pix_key,recipient,enabled FROM manual_pix_settings WHERE store_id=?").bind(store.id).first();
  const orders=await list("SELECT m.order_id,m.amount_cents,m.status,m.confirmed_at,o.status AS order_status FROM manual_pix_orders m JOIN orders o ON o.id=m.order_id WHERE m.store_id=? ORDER BY o.created_at DESC LIMIT 100",store.id);
  return json({settings,orders});
 }
 if(path==="/api/commerce/manual-pix"&&request.method==="POST"){
  if(body.enabled===false){await env.DB.prepare("UPDATE manual_pix_settings SET enabled=0 WHERE store_id=?").bind(store.id).run();return json({success:true});}
  const bank=String(body.bank||""),type=String(body.key_type||""),key=String(body.pix_key||"").trim(),recipient=String(body.recipient||"").trim();
  const patterns={CPF:/^\d{11}$/,CNPJ:/^\d{14}$/,EMAIL:/^[^\s@]+@[^\s@]+\.[^\s@]+$/,PHONE:/^\+55\d{10,11}$/,EVP:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i};
  if(!["nubank","picpay","itau","other"].includes(bank)||!Object.hasOwn(patterns,type)||!patterns[type].test(key)||key.length>150||!recipient||recipient.length>100||/[\r\n]/.test(recipient))return fail("Informe banco, titular e chave Pix válidos. Use apenas dígitos no CPF/CNPJ e +55 no telefone.");
  if(body.accept_disclosure!==true)return fail("Confirme que a chave será exibida privadamente ao comprador.");
  await env.DB.prepare("INSERT INTO manual_pix_settings(store_id,bank,key_type,pix_key,recipient,enabled) VALUES(?,?,?,?,?,1) ON CONFLICT(store_id) DO UPDATE SET bank=excluded.bank,key_type=excluded.key_type,pix_key=excluded.pix_key,recipient=excluded.recipient,enabled=1").bind(store.id,bank,type,key,recipient).run();
  return json({success:true});
 }
 if(path==="/api/commerce/manual-pix/confirm"&&request.method==="POST"){
  const id=String(body.order_id||""),reference=String(body.bank_reference||"").trim();
  if(body.verified!==true||!/^E[0-9A-Za-z]{31}$/.test(reference))return fail("Confira o crédito no extrato e informe o ID de transação Pix (EndToEndId de 32 caracteres).");
  const row=await env.DB.prepare("SELECT m.*,o.status AS order_status,o.total_cents FROM manual_pix_orders m JOIN orders o ON o.id=m.order_id WHERE m.order_id=? AND m.store_id=?").bind(id,store.id).first();
  if(!row)return fail("Pedido Pix manual não encontrado.",404);
  if(row.status!=="pending"||row.order_status!=="pending")return fail("Pedido já processado ou indisponível.",409);
  if(row.amount_cents!==row.total_cents)return fail("Valor divergente.",409);
  let result;
  try{result=await env.DB.batch([
   env.DB.prepare("UPDATE manual_pix_orders SET status='confirmed',confirmed_by=?,bank_reference=?,confirmed_at=datetime('now') WHERE order_id=? AND store_id=? AND status='pending' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='pending')").bind(user.id,reference,id,store.id,id),
   env.DB.prepare("UPDATE orders SET status='paid',paid_at=datetime('now') WHERE id=? AND store_id=? AND status='pending' AND EXISTS(SELECT 1 FROM manual_pix_orders WHERE order_id=? AND status='confirmed' AND bank_reference=?)").bind(id,store.id,id,reference)
  ]);}catch{return fail("Referência já utilizada ou confirmação indisponível.",409);}
  if(!result[0].meta.changes)return fail("Pedido já processado.",409);
  let delivery="pending";try{delivery=await deliver(env,id);}catch{}
  return json({success:true,status:delivery==="delivered"?"delivered":"paid",delivery});
 }
 if(path==="/api/commerce/manual-pix/retry-delivery"&&request.method==="POST"){
  const id=String(body.order_id||"");
  const row=await env.DB.prepare("SELECT o.status FROM orders o JOIN manual_pix_orders m ON m.order_id=o.id WHERE o.id=? AND o.store_id=? AND m.status='confirmed'").bind(id,store.id).first();
  if(!row)return fail("Pedido confirmado não encontrado.",404);
  if(row.status==="delivering")return fail("Entrega em análise. Confira a mensagem enviada antes de qualquer reenvio.",409);
  if(row.status!=="paid"&&row.status!=="delivered")return fail("Pedido indisponível.",409);
  let delivery="pending";try{delivery=await deliver(env,id);}catch{}
  return json({success:true,delivery});
 }
 if(path==="/api/commerce/pix"&&request.method==="POST"){
  if(env.ENABLE_SANDBOX_PAYMENTS!=="true")return fail("Cobranças desativadas até a homologação.",503);
  const order=await env.DB.prepare("SELECT o.*,v.name AS variant_name,v.infinite_stock,p.name AS product_name FROM orders o JOIN variants v ON v.id=o.variant_id JOIN products p ON p.id=v.product_id WHERE o.id=? AND o.store_id=? AND o.status='pending'").bind(String(body.order_id||""),store.id).first();
  if(!order)return fail("Pedido pendente não encontrado.",404);
  if(await env.DB.prepare("SELECT order_id FROM manual_pix_orders WHERE order_id=?").bind(order.id).first())return fail("Este pedido utiliza Pix manual.",409);
  if(order.infinite_stock)return fail("Cobrança automática para estoque infinito ainda não homologada.",409);
  const reserved=await env.DB.prepare("SELECT s.id FROM order_stock os JOIN stock s ON s.id=os.stock_id WHERE os.order_id=? AND s.status='reserved'").bind(order.id).first();
  if(!reserved)return fail("Reserva de estoque expirou. Crie um novo pedido.",409);
  const buyerName=String(body.buyer_name||"").trim(),email=String(body.buyer_email||"").trim().toLowerCase();
  if(buyerName.length<2||buyerName.length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return fail("Informe nome e e-mail válidos para gerar o Pix.");
  const gateway=await env.DB.prepare("SELECT * FROM gateways WHERE store_id=? AND is_primary=1 AND status='connected'").bind(store.id).first();
  if(!gateway)return fail("Conecte um provedor de pagamento primeiro.",409);
  if(gateway.provider!=="asaas_sandbox")return fail("Nesta fase, apenas cobranças Asaas Sandbox são permitidas.",409);
  if(!env.GATEWAY_ENCRYPTION_KEY||env.GATEWAY_ENCRYPTION_KEY.length<32)return fail("Chave de criptografia não configurada.",503);
  const [ivHex,cipherHex]=String(gateway.credentials_encrypted||"").split(":");
  if(!ivHex||!cipherHex)return fail("Credencial armazenada inválida.",500);
  const bytes=h=>Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16));
  const cryptoKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.GATEWAY_ENCRYPTION_KEY),"AES-GCM",false,["decrypt"]);
  let token;try{token=new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(ivHex)},cryptoKey,bytes(cipherHex)));}catch{return fail("Não foi possível abrir a credencial.",500);}
  const externalReference="zynox_"+order.id;
  const previous=await env.DB.prepare("SELECT id,pix_code,qr_code,expires_at FROM payments WHERE order_id=? AND status='pending'").bind(order.id).first();
  if(previous)return json({success:true,payment:previous});
  let externalId,pixCode,qrCode,expiresAt;
  if(gateway.provider==="asaas"||gateway.provider==="asaas_sandbox"){
   const base=gateway.provider==="asaas"?"https://api.asaas.com/v3":"https://api-sandbox.asaas.com/v3";
   const headers={"access_token":token,"Content-Type":"application/json"};
   const customerRes=await fetch(base+"/customers",{method:"POST",headers,body:JSON.stringify({name:buyerName,email,externalReference}),signal:AbortSignal.timeout(12000)});
   if(!customerRes.ok)return fail("Asaas não conseguiu cadastrar o pagador.",502);
   const customer=await customerRes.json();
   const dueDate=new Date(Date.now()+10*60*1000).toISOString().slice(0,10);
   const paymentRes=await fetch(base+"/payments",{method:"POST",headers,body:JSON.stringify({customer:customer.id,billingType:"PIX",value:order.total_cents/100,dueDate,description:(order.product_name+" - "+order.variant_name).slice(0,500),externalReference}),signal:AbortSignal.timeout(12000)});
   if(!paymentRes.ok)return fail("Asaas não conseguiu gerar a cobrança Pix.",502);
   const payment=await paymentRes.json();externalId=payment.id;expiresAt=payment.dueDate;
   const qrRes=await fetch(base+"/payments/"+encodeURIComponent(externalId)+"/pixQrCode",{headers,signal:AbortSignal.timeout(12000)});
   if(!qrRes.ok)return fail("Cobrança criada, mas não foi possível obter o QR Code. Consulte o painel Asaas.",502);
   const qr=await qrRes.json();pixCode=qr.payload;qrCode=qr.encodedImage;
  }else if(gateway.provider==="mercadopago"){
   const paymentRes=await fetch("https://api.mercadopago.com/v1/payments",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","X-Idempotency-Key":order.id},body:JSON.stringify({transaction_amount:order.total_cents/100,description:(order.product_name+" - "+order.variant_name).slice(0,255),payment_method_id:"pix",external_reference:externalReference,payer:{email,first_name:buyerName}}),signal:AbortSignal.timeout(12000)});
   if(!paymentRes.ok)return fail("Mercado Pago não conseguiu gerar a cobrança Pix.",502);
   const payment=await paymentRes.json();externalId=String(payment.id);pixCode=payment.point_of_interaction?.transaction_data?.qr_code;qrCode=payment.point_of_interaction?.transaction_data?.qr_code_base64;expiresAt=payment.date_of_expiration;
  }else return fail("Provedor não suportado para Pix.",400);
  if(!externalId||!pixCode)return fail("O provedor não retornou os dados Pix.",502);
  await env.DB.prepare("UPDATE stock SET reserved_until=datetime('now','+24 hours') WHERE id IN (SELECT stock_id FROM order_stock WHERE order_id=?) AND status='reserved'").bind(order.id).run();
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO payments(id,order_id,gateway_id,external_id,amount_cents,pix_code,qr_code,status,expires_at) VALUES(?,?,?,?,?,?,?,'pending',?)").bind(id,order.id,gateway.id,externalId,order.total_cents,pixCode,qrCode||null,""+(expiresAt||"")).run();
  return json({success:true,payment:{id,external_id:externalId,amount_cents:order.total_cents,pix_code:pixCode,qr_code:qrCode||null,expires_at:expiresAt||null}},201);
 }
 if(path==="/api/commerce/gateways"&&request.method==="POST"){
  const provider=String(body.provider||""),token=String(body.api_token||"").trim();
  const endpoints={mercadopago:{url:"https://api.mercadopago.com/users/me",headers:t=>({Authorization:"Bearer "+t})},asaas:{url:"https://api.asaas.com/v3/myAccount",headers:t=>({access_token:t})},asaas_sandbox:{url:"https://api-sandbox.asaas.com/v3/myAccount",headers:t=>({access_token:t})}};
  if(!endpoints[provider]||token.length<20||token.length>4000)return fail("Provedor ou token inválido.");
  if(!env.GATEWAY_ENCRYPTION_KEY||env.GATEWAY_ENCRYPTION_KEY.length<32)return fail("Configure GATEWAY_ENCRYPTION_KEY nos secrets da Cloudflare.",503);
  const test=await fetch(endpoints[provider].url,{headers:{...endpoints[provider].headers(token),Accept:"application/json"},signal:AbortSignal.timeout(10000)});
  if(!test.ok)return fail("O provedor recusou a credencial. Confira a chave e o ambiente.",422);
  const raw=await test.json();
  const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.GATEWAY_ENCRYPTION_KEY),"AES-GCM",false,["encrypt"]);
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(token));
  const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
  const encrypted=hex(iv)+":"+hex(cipher),existing=await env.DB.prepare("SELECT id FROM gateways WHERE store_id=? AND provider=?").bind(store.id,provider).first(),id=existing?.id||crypto.randomUUID();
  await env.DB.prepare("UPDATE gateways SET is_primary=0 WHERE store_id=?").bind(store.id).run();
  await env.DB.prepare("INSERT INTO gateways(id,store_id,provider,credentials_encrypted,is_primary,status) VALUES(?,?,?,?,1,'connected') ON CONFLICT(id) DO UPDATE SET credentials_encrypted=excluded.credentials_encrypted,is_primary=1,status='connected'").bind(id,store.id,provider,encrypted).run();
  return json({success:true,gateway:{id,provider,status:"connected",account:raw.nickname||raw.name||raw.email||"Conta verificada"}},201);
 }
 if(path==="/api/commerce/wallet"||path.startsWith("/api/commerce/wallet/"))return fail("EM BREVE !",503);
 if(path==="/api/commerce/coupons"&&request.method==="POST"){
  const code=String(body.code||"").trim().toUpperCase(),discount=Number(body.discount);
  if(!/^[A-Z0-9_-]{2,32}$/.test(code)||!Number.isInteger(discount)||discount<1||discount>100)return fail("Cupom inválido.");
  const result=await env.DB.prepare("INSERT INTO coupons(id,store_id,code,discount) VALUES(?,?,?,?) ON CONFLICT(store_id,code) DO NOTHING").bind(crypto.randomUUID(),store.id,code,discount).run();
  return result.meta.changes?json({success:true}):fail("Cupom já existe.",409);
 }
 return fail("Funcionalidade indisponível.",404);
}
