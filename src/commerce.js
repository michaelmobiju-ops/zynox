import {getSession} from "./auth.js";
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const fail=(error,status=400)=>json({error},status);
export async function commerce(request,env){
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
  const check=await fetch(url.origin+"/api/store/channels?store="+encodeURIComponent(store.id),{headers:{Cookie:request.headers.get("Cookie")||""}});
  if(!check.ok||!(await check.json()).channels?.some(c=>c.id===channel&&c.available))return fail("Canal não autorizado.",403);
  const id=crypto.randomUUID();
  await env.DB.batch([env.DB.prepare("INSERT INTO products(id,store_id,name,description,image_url,color,button_text,has_variations,channel_id,status) VALUES(?,?,?,?,?,?,?,?,?,'draft')").bind(id,store.id,name,description,image,color,button,body.has_variations?1:0,channel),...variants.map(v=>env.DB.prepare("INSERT INTO variants(id,product_id,name,price_cents) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,v.name.trim(),v.price_cents))]);
  return json({success:true,id},201);
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
