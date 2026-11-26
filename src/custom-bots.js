import {getSession} from "./auth.js";
const respond=(value,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
const fail=(message,status=400)=>respond({error:message},status);
const enc=new TextEncoder();
async function key(env){
 if(!env.PASSWORD_PEPPER||env.PASSWORD_PEPPER.length<16)throw Error("Criptografia indisponível: configure PASSWORD_PEPPER.");
 const root=await crypto.subtle.importKey("raw",enc.encode(env.PASSWORD_PEPPER),"HKDF",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:enc.encode("zynox-custom-bots-v1"),info:enc.encode("discord-bot-token")},root,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
const unhex=str=>Uint8Array.from(str.match(/../g)||[],x=>parseInt(x,16));
async function seal(env,value){const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(env),enc.encode(value));return hex(iv)+":"+hex(new Uint8Array(bytes));}
export async function customBotToken(env,record){const [iv,data]=record.token_cipher.split(":");return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unhex(iv)},await key(env),unhex(data)));}
async function discord(token,path,options={}){
 const response=await fetch("https://discord.com/api/v10"+path,{...options,headers:{Authorization:"Bot "+token,...options.headers},signal:AbortSignal.timeout(9000)});
 const data=await response.json().catch(()=>({}));
 return {ok:response.ok,status:response.status,data};
}
export async function customBots(request,env){
 const url=new URL(request.url);
 const user=await getSession(request,env);
 if(!user)return fail("Autenticação necessária.",401);
 if(user.role==="subscriber"&&!await env.DB.prepare("SELECT id FROM subscriptions WHERE user_id=? AND status='active' AND (lifetime=1 OR datetime(expires_at)>datetime('now'))").bind(user.id).first())return fail("Assinatura necessária.",403);
 if(!["GET","POST"].includes(request.method))return fail("Método não permitido.",405);
 if(request.method==="POST"&&request.headers.get("Origin")!==url.origin)return fail("Origem não autorizada.",403);
 let body={};if(request.method==="POST"){try{body=await request.json()}catch{return fail("JSON inválido.");}}
 const storeId=String(body.store_id||url.searchParams.get("store")||"");
 const store=await env.DB.prepare("SELECT id,guild_id FROM stores WHERE id=? AND owner_id=?").bind(storeId,user.id).first();
 if(!store)return fail("Servidor não encontrado ou sem permissão.",404);
 const current=await env.DB.prepare("SELECT store_id,application_id,bot_user_id,bot_name,public_key,token_cipher FROM custom_bots WHERE store_id=?").bind(storeId).first();
 if(request.method==="GET")return respond({connected:!!current,bot:current?{application_id:current.application_id,bot_user_id:current.bot_user_id,name:current.bot_name,interactions_url:url.origin+"/discord/interactions/"+current.application_id}:null});
 if(url.pathname==="/api/custom-bot/connect"){
  const token=String(body.token||"").trim();
  if(token.length<40||token.length>300||!/^[A-Za-z0-9._-]+$/.test(token))return fail("Token do bot inválido.");
  const [identity,app,guild]=await Promise.all([
   discord(token,"/users/@me"),
   discord(token,"/oauth2/applications/@me"),
   discord(token,"/guilds/"+encodeURIComponent(store.guild_id)+"/members/@me")
  ]);
  if(!identity.ok||!identity.data.bot||!app.ok||!app.data.id)return fail("Token não autorizado pelo Discord ou aplicação não encontrada.",403);
  if(!guild.ok)return fail("Adicione seu bot ao servidor selecionado antes de conectá-lo.",409);
  if(!/^[a-f0-9]{64}$/i.test(app.data.verify_key||""))return fail("Chave pública da aplicação indisponível no Discord.",502);
  if(current&&current.application_id!==app.data.id)return fail("Desconecte o bot anterior antes de conectar outro.",409);
  const existing=await env.DB.prepare("SELECT store_id FROM custom_bots WHERE application_id=? AND store_id<>?").bind(app.data.id,storeId).first();
  if(existing)return fail("Este bot já está conectado a outra loja.",409);
  const cipher=await seal(env,token);
  await env.DB.prepare("INSERT INTO custom_bots(store_id,application_id,bot_user_id,public_key,token_cipher,bot_name) VALUES(?,?,?,?,?,?) ON CONFLICT(store_id) DO UPDATE SET token_cipher=excluded.token_cipher,public_key=excluded.public_key,bot_name=excluded.bot_name,updated_at=CURRENT_TIMESTAMP").bind(storeId,app.data.id,identity.data.id,app.data.verify_key,cipher,identity.data.username||"Bot").run();
  return respond({connected:true,bot:{application_id:app.data.id,name:identity.data.username},interactions_url:url.origin+"/discord/interactions/"+app.data.id});
 }
 if(url.pathname==="/api/custom-bot/profile"){
  if(!current)return fail("Conecte seu bot primeiro.",409);
  const kind=String(body.kind||"");
  const token=await customBotToken(env,current);
  if(kind==="avatar"||kind==="banner"){
   const data=String(body.image||"");
   if(data.length>1400000||!/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(data))return fail("Envie uma imagem PNG, JPG, GIF ou WEBP de até 1 MB.");
   const response=await discord(token,"/users/@me",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({[kind]:data})});
   if(!response.ok)return fail("Discord recusou a alteração de "+kind+" (HTTP "+response.status+").",502);
   return respond({success:true});
  }
  if(kind==="bio"){
   const description=String(body.description||"").trim();
   if(!description||description.length>400)return fail("Informe uma descrição de até 400 caracteres.");
   const response=await discord(token,"/applications/@me",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({description})});
   if(!response.ok)return fail("O Discord não permitiu editar a descrição desta aplicação (HTTP "+response.status+").",502);
   return respond({success:true});
  }
  return fail("Tipo de edição inválido.");
 }
 return fail("Rota não encontrada.",404);
}
