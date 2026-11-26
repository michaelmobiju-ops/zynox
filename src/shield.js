import {getSession} from "./auth.js";
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,"0")).join("");}
export async function shield(request,env){
 const url=new URL(request.url);
 if(!["GET","POST"].includes(request.method))return json({error:"Método não permitido."},405);
 if(request.method==="POST"&&request.headers.get("Origin")!==url.origin)return json({error:"Origem não autorizada."},403);
 if(request.method==="GET"&&url.pathname!=="/api/shield/sessions")return json({error:"Método não permitido."},405);
 const user=await getSession(request,env);
 if(!user)return json({error:"Autenticação necessária."},401);
 
 const token=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("zynox_session="))?.slice(14);
 if(!token||! /^[a-f0-9]{64}$/.test(token))return json({error:"Sessão inválida."},401);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,"0")).join("");
 if(url.pathname==="/api/shield/sessions"&&request.method==="GET"){
 const rows=(await env.DB.prepare("SELECT token_hash,expires_at FROM sessions WHERE user_id=? AND datetime(expires_at)>datetime('now') ORDER BY expires_at DESC LIMIT 100").bind(user.id).all()).results;
 const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id=? AND datetime(expires_at)>datetime('now')").bind(user.id).first();
 return json({active_sessions:Number(count.total),sessions:await Promise.all(rows.map(async row=>({id:await digest("session-id:"+row.token_hash),expires_at:row.expires_at,current:row.token_hash===hash})))});

 }
 if(request.method!=="POST")return json({error:"Método não permitido."},405);
 if(url.pathname==="/api/shield/sessions/revoke"){
 let body;try{body=await request.json()}catch{return json({error:"Dados inválidos."},400)}
 if(typeof body?.id!=="string"||!/^[a-f0-9]{64}$/.test(body.id))return json({error:"Sessão inválida."},400);
 const rows=(await env.DB.prepare("SELECT token_hash FROM sessions WHERE user_id=? AND token_hash<>? AND datetime(expires_at)>datetime('now') ORDER BY expires_at DESC LIMIT 100").bind(user.id,hash).all()).results;
 let target;for(const row of rows){if(await digest("session-id:"+row.token_hash)===body.id){target=row.token_hash;break;}}
 if(!target)return json({error:"Sessão não encontrada."},404);
 const result=await env.DB.batch([env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash=? AND token_hash<>?").bind(user.id,target,hash),env.DB.prepare("INSERT INTO audit_logs(id,user_id,action,details) VALUES(?,?,?,?)").bind(crypto.randomUUID(),user.id,"REVOKE_SESSION","{}")]);
 return json({success:true,revoked:result[0].meta.changes});
 }
 if(url.pathname!=="/api/shield/sessions/revoke-others")return json({error:"Rota não encontrada."},404);
 const result=await env.DB.batch([
 env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.id,hash),
 env.DB.prepare("INSERT INTO audit_logs(id,user_id,action,details) VALUES(?,?,?,?)").bind(crypto.randomUUID(),user.id,"REVOKE_OTHER_SESSIONS","{}")
 ]);
 return json({success:true,revoked:result[0].meta.changes});
}
