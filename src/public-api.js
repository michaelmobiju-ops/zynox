const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function hashApiKey(key){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,"0")).join("");}
export function csvCell(value){let s=String(value??"");if(/^[\s]*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export async function publicApi(request,env){
 if(request.method!=="GET")return json({error:"Método não permitido."},405);
 if(new URL(request.url).pathname!=="/api/v1/products")return json({error:"Rota inexistente."},404);
 const token=request.headers.get("Authorization")||"";
 if(!/^Bearer ZAPI-[a-f0-9]{64}$/.test(token))return json({error:"Credencial inválida."},401);
 const db=env.DB,k=await db.prepare("SELECT k.id,k.store_id FROM external_api_keys k JOIN stores s ON s.id=k.store_id JOIN users u ON u.id=s.owner_id WHERE k.key_hash=? AND k.revoked=0 AND u.status='active' AND (u.role<>'subscriber' OR EXISTS(SELECT 1 FROM subscriptions WHERE user_id=u.id AND status='active' AND (lifetime=1 OR datetime(expires_at)>datetime('now'))))").bind(await hashApiKey(token.slice(7))).first();
 if(!k)return json({error:"Credencial inválida."},401);
 const minute=Math.floor(Date.now()/60000);
 const result=await db.prepare("INSERT INTO api_usage(key_id,minute,hits) VALUES(?,?,1) ON CONFLICT(key_id,minute) DO UPDATE SET hits=hits+1 WHERE hits<60").bind(k.id,minute).run();
 if(result.meta.changes!==1)return json({error:"Limite de requisições."},429);
 await db.prepare("DELETE FROM api_usage WHERE key_id=? AND minute<?").bind(k.id,minute-60).run();
 const rows=await db.prepare("SELECT id,name,description FROM products WHERE store_id=? AND status='active' ORDER BY id LIMIT 100").bind(k.store_id).all();return json({products:rows.results});
}
