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
  const payload={embeds:[embed],allowed_mentions:{parse:[]},components:[{type:1,components:[{type:2,style:1,label:p.button_text,custom_id:"buy:"+p.id,disabled:true}]}]};
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
  const orders=await list("SELECT o.id,o.status,o.total_cents,o.created_at,c.username FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.store_id=? ORDER BY o.created_at DESC LIMIT 100",store.id);
  return json({orders,customers:await list("SELECT discord_id,username,created_at FROM customers WHERE store_id=? LIMIT 100",store.id),coupons:await list("SELECT * FROM coupons WHERE store_id=?",store.id),wallet:await list("SELECT type,amount_cents,status,created_at FROM wallet_transactions WHERE store_id=? ORDER BY created_at DESC LIMIT 100",store.id),gateways:await list("SELECT id,provider,status,is_primary FROM gateways WHERE store_id=?",store.id),tickets:await list("SELECT id,subject,status,created_at FROM tickets WHERE store_id=? LIMIT 100",store.id)});
 }
 if(path==="/api/commerce/coupons"&&request.method==="POST"){
  const code=String(body.code||"").trim().toUpperCase(),discount=Number(body.discount);
  if(!/^[A-Z0-9_-]{2,32}$/.test(code)||!Number.isInteger(discount)||discount<1||discount>100)return fail("Cupom inválido.");
  const result=await env.DB.prepare("INSERT INTO coupons(id,store_id,code,discount) VALUES(?,?,?,?) ON CONFLICT(store_id,code) DO NOTHING").bind(crypto.randomUUID(),store.id,code,discount).run();
  return result.meta.changes?json({success:true}):fail("Cupom já existe.",409);
 }
 return fail("Funcionalidade indisponível.",404);
}
