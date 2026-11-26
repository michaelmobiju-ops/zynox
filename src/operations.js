import {getSession} from "./auth.js";
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function ownerMetrics(request,env){
 if(request.method!=="GET")return json({error:"Método não permitido."},405);
 const user=await getSession(request,env);if(!user||user.role!=="owner")return json({error:"Acesso negado."},403);
 const row=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM users WHERE role='subscriber') AS subscribers,(SELECT COUNT(*) FROM users WHERE role='admin') AS admins,(SELECT COUNT(*) FROM stores) AS stores,(SELECT COUNT(*) FROM subscriptions WHERE status='active' AND (lifetime=1 OR datetime(expires_at)>datetime('now'))) AS active_subscriptions").first();
 return json({metrics:row});
}
export async function monitor(request,env){
 if(request.method!=="GET")return json({error:"Método não permitido."},405);
 const start=performance.now();try{await env.DB.prepare("SELECT 1 AS ok").first();return json({api:"reachable",database:"reachable",database_probe_ms:Math.round(performance.now()-start),checked_at:new Date().toISOString()});}catch{return json({api:"reachable",database:"unavailable",checked_at:new Date().toISOString()},503);}
}
export async function configurationExport(db,store){
 const statements=[db.prepare("SELECT id,name,description,color,button_text,has_variations,status FROM products WHERE store_id=? ORDER BY id LIMIT 1001").bind(store.id),db.prepare("SELECT v.id,v.product_id,v.name,v.price_cents,v.infinite_stock FROM variants v JOIN products p ON p.id=v.product_id WHERE p.store_id=? ORDER BY v.id LIMIT 1001").bind(store.id),db.prepare("SELECT slug,description,maintenance FROM storefront_profiles WHERE store_id=?").bind(store.id)];
 const [p,v,f]=await db.batch(statements);if(p.results.length>1000||v.results.length>1000)return json({error:"Limite de exportação excedido."},413);
 const payload={version:1,store_id:store.id,created_at:new Date().toISOString(),products:p.results,variants:v.results,storefront:f.results[0]||null};
 const serialized=JSON.stringify(payload);const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(serialized))),x=>x.toString(16).padStart(2,"0")).join("");
 return new Response(JSON.stringify({payload,sha256:digest}),{headers:{"Content-Type":"application/json","Content-Disposition":"attachment; filename=zynox-config.json","Cache-Control":"no-store"}});
}
