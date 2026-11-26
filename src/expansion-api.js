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
 if(path==="/api/commerce/branding"){
 if(method==="GET")return json({branding:await db.prepare("SELECT * FROM store_branding WHERE store_id=?").bind(store.id).first()});
 const name=typeof body.commercial_name==="string"?body.commercial_name.trim():"",color=body.accent_color,footer=body.receipt_footer??"";
 if(!name||name.length>100||typeof color!=="string"||!/^#[a-f0-9]{6}$/i.test(color)||typeof footer!=="string"||footer.length>500)return json({error:"Identidade inválida."},400);
 await db.prepare("INSERT INTO store_branding(store_id,commercial_name,accent_color,receipt_footer) VALUES(?,?,?,?) ON CONFLICT(store_id) DO UPDATE SET commercial_name=excluded.commercial_name,accent_color=excluded.accent_color,receipt_footer=excluded.receipt_footer").bind(store.id,name,color,footer).run();return json({success:true});
 }
 if(path==="/api/commerce/staff"){
 if(method==="GET")return json({staff:(await db.prepare("SELECT s.user_id,u.username,s.department,s.status FROM store_staff s JOIN users u ON u.id=s.user_id WHERE s.store_id=? ORDER BY u.username LIMIT 100").bind(store.id).all()).results});
 const id=String(body.user_id||""),department=body.department,status=body.status;
 if(!["sales","support","finance","stock","marketing"].includes(department)||!["active","suspended"].includes(status)||id===user.id)return json({error:"Equipe inválida."},400);
 const member=await db.prepare("SELECT id FROM users WHERE id=? AND role='subscriber' AND status='active'").bind(id).first();if(!member)return json({error:"Conta indisponível."},404);
 await db.batch([db.prepare("INSERT INTO store_staff(store_id,user_id,department,status) VALUES(?,?,?,?) ON CONFLICT(store_id,user_id) DO UPDATE SET department=excluded.department,status=excluded.status").bind(store.id,id,department,status),db.prepare("INSERT INTO audit_logs(id,user_id,action,details) VALUES(?,?,?,?)").bind(crypto.randomUUID(),user.id,"STAFF_RECORD_UPDATED",JSON.stringify({store_id:store.id,member_id:id,department,status}))]);return json({success:true,access_granted:false});
 }
 if(path==="/api/commerce/crm"&&method==="GET"){
 const url=new URL(request.url),q=(url.searchParams.get("q")||"").slice(0,100),offset=Number(url.searchParams.get("offset")||0);
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:"Paginação inválida."},400);
 const rows=await db.prepare("SELECT c.id,c.discord_id,c.username,COUNT(o.id) AS orders,MIN(o.created_at) AS first_order,MAX(o.created_at) AS last_order,COALESCE(SUM(CASE WHEN o.status IN ('paid','delivering','delivered') THEN o.total_cents ELSE 0 END),0) AS spent_cents FROM customers c LEFT JOIN orders o ON o.customer_id=c.id AND o.store_id=c.store_id WHERE c.store_id=? AND (instr(lower(coalesce(c.username,'')),lower(?))>0 OR instr(c.discord_id,?)>0) GROUP BY c.id ORDER BY c.id LIMIT 50 OFFSET ?").bind(store.id,q,q,offset).all();return json({customers:rows.results,next_offset:rows.results.length===50?offset+50:null});
 }
 if(path==="/api/commerce/campaigns"){
 if(method==="GET")return json({campaigns:(await db.prepare("SELECT id,title,message,created_at FROM marketing_campaigns WHERE store_id=? ORDER BY created_at DESC LIMIT 100").bind(store.id).all()).results});
 const title=typeof body.title==="string"?body.title.trim():"",message=typeof body.message==="string"?body.message.trim():"";
 if(!title||title.length>100||!message||message.length>2000)return json({error:"Campanha inválida."},400);
 const id=crypto.randomUUID();await db.prepare("INSERT INTO marketing_campaigns(id,store_id,title,message) VALUES(?,?,?,?)").bind(id,store.id,title,message).run();return json({id,status:"draft"},201);
 }
 return null;
}
