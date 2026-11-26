import {getSession} from "./auth.js";
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function shield(request,env){
 const url=new URL(request.url);
 if(request.method!=="POST")return json({error:"Método não permitido."},405);
 if(request.headers.get("Origin")!==url.origin)return json({error:"Origem não autorizada."},403);
 const user=await getSession(request,env);
 if(!user)return json({error:"Autenticação necessária."},401);
 if(url.pathname!=="/api/shield/sessions/revoke-others")return json({error:"Rota não encontrada."},404);
 const token=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("zynox_session="))?.slice(14);
 if(!token||! /^[a-f0-9]{64}$/.test(token))return json({error:"Sessão inválida."},401);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,"0")).join("");
 const result=await env.DB.batch([
 env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.id,hash),
 env.DB.prepare("INSERT INTO audit_logs(id,user_id,action,details) VALUES(?,?,?,?)").bind(crypto.randomUUID(),user.id,"REVOKE_OTHER_SESSIONS","{}")
 ]);
 return json({success:true,revoked:result[0].meta.changes});
}
