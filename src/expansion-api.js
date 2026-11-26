const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function expansionApi(path,request,env,store,body,user){
 const db=env.DB,method=request.method;
 if(path==="/api/commerce/storefront-profile"){
 if(method==="GET")return json({profile:await db.prepare("SELECT * FROM storefront_profiles WHERE store_id=?").bind(store.id).first()});
 const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"",description=typeof body.description==="string"?body.description.trim():"";
 if(!/^[a-z0-9][a-z0-9-]{2,47}$/.test(slug)||/^[a-f0-9-]{36}$/.test(slug)||description.length>2000||typeof body.maintenance!=="boolean")return json({error:"Configuração inválida."},400);
 try{await db.prepare("INSERT INTO storefront_profiles(store_id,slug,description,maintenance) VALUES(?,?,?,?) ON CONFLICT(store_id) DO UPDATE SET slug=excluded.slug,description=excluded.description,maintenance=excluded.maintenance").bind(store.id,slug,description,Number(body.maintenance)).run();}catch(e){if(String(e).includes("UNIQUE"))return json({error:"Endereço indisponível."},409);throw e;}
 return json({success:true});
 }
 if(path==="/api/commerce/ticket-queue"&&method==="GET"){
 const rows=await db.prepare("SELECT id,subject,channel_id,status,created_at FROM tickets WHERE store_id=? AND status='open' ORDER BY created_at,id LIMIT 100").bind(store.id).all();return json({tickets:rows.results});
 }
 if(path==="/api/commerce/product-licenses"){
 if(method==="GET"){const rows=await db.prepare("SELECT id,product_id,expires_at,status,created_at FROM product_licenses WHERE store_id=? ORDER BY created_at DESC LIMIT 100").bind(store.id).all();return json({licenses:rows.results});}
 const product=await db.prepare("SELECT id FROM products WHERE id=? AND store_id=? AND status!='archived'").bind(String(body.product_id||""),store.id).first();
 if(!product)return json({error:"Produto não encontrado."},404);
 const days=body.days;if(days!==null&&(!Number.isInteger(days)||days<1||days>36500))return json({error:"Validade inválida."},400);
 const quantity=body.quantity??1;if(!Number.isInteger(quantity)||quantity<1||quantity>50)return json({error:"Quantidade inválida."},400);
 const expires=days===null?null:new Date(Date.now()+days*86400000).toISOString(),keys=[],statements=[];
 for(let i=0;i<quantity;i++){const key="ZPL-"+Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,"0")).join("");const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,"0")).join("");const id=crypto.randomUUID();keys.push({id,key});statements.push(db.prepare("INSERT INTO product_licenses(id,store_id,product_id,key_hash,expires_at) VALUES(?,?,?,?,?)").bind(id,store.id,product.id,hash,expires));}
 statements.push(db.prepare("INSERT INTO audit_logs(id,user_id,action,details) VALUES(?,?,?,?)").bind(crypto.randomUUID(),user.id,"PRODUCT_LICENSES_CREATED",JSON.stringify({store_id:store.id,product_id:product.id,quantity})));await db.batch(statements);return json({licenses:keys,expires_at:expires},201);
 }
 return null;
}
