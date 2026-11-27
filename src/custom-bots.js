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
export async function botTokenForStore(env,storeId){
 let record;
 try{record=await env.DB.prepare("SELECT token_cipher FROM custom_bots WHERE store_id=?").bind(storeId).first();}
 catch(error){if(!String(error).includes("no such table"))throw error;return env.DISCORD_BOT_TOKEN||null;}
 if(record)return customBotToken(env,record);
 return env.DISCORD_BOT_TOKEN||null;
}
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
 if(request.method==="POST"&&url.pathname==="/api/custom-bot/discover"){
  if(!user.discord_id)return fail("Vincule sua conta Discord uma única vez para verificar suas permissões.",403);
  const token=String(body.token||"").trim();
  if(token.length<40||token.length>300||!/^[A-Za-z0-9._-]+$/.test(token))return fail("Informe um token de bot válido.");
  const identity=await discord(token,"/users/@me");
  if(!identity.ok||!identity.data.bot)return fail("Token do bot não autorizado.",403);
  const result=await discord(token,"/users/@me/guilds?limit=200");
  if(!result.ok||!Array.isArray(result.data))return fail("Não foi possível consultar servidores.",502);
  const servers=[];
  for(const g of result.data.slice(0,20)){
   const [guild,member]=await Promise.all([discord(token,"/guilds/"+g.id),discord(token,"/guilds/"+g.id+"/members/"+user.discord_id)]);
   if(!guild.ok||!member.ok)continue;
   const roles=new Set([g.id,...(member.data.roles||[])]);
   const perms=(guild.data.roles||[]).reduce((p,r)=>roles.has(r.id)?p|BigInt(r.permissions):p,0n);
   if(guild.data.owner_id!==user.discord_id&&!(perms&40n))continue;
   const existing=await env.DB.prepare("SELECT owner_id FROM stores WHERE guild_id=?").bind(g.id).first();
   if(existing&&existing.owner_id!==user.id)continue;
   servers.push({id:g.id,name:g.name});
  }
  return respond({servers,limited:result.data.length>20});
 }
 if(request.method==="POST"&&url.pathname==="/api/custom-bot/link"){
  if(!user.discord_id)return fail("Vincule sua conta Discord antes de continuar.",403);
  const guildId=String(body.guild_id||""),token=String(body.token||"").trim();
  if(!/^\d{17,20}$/.test(guildId)||token.length<40||token.length>300||!/^[A-Za-z0-9._-]+$/.test(token))return fail("ID do servidor ou token inválido.");
  const [identity,app,guild,member]=await Promise.all([discord(token,"/users/@me"),discord(token,"/oauth2/applications/@me"),discord(token,"/guilds/"+guildId),discord(token,"/guilds/"+guildId+"/members/"+user.discord_id)]);
  if(!identity.ok)return fail("Discord recusou a validação do token (HTTP "+identity.status+").",403);
  if(!identity.data.bot)return fail("A credencial informada não pertence a um bot.",403);
  if(!app.ok||!app.data.id)return fail("Não foi possível consultar a aplicação do bot (HTTP "+app.status+").",403);
  if(!guild.ok)return fail("O bot não conseguiu acessar o servidor selecionado (HTTP "+guild.status+"). Instale seu bot nesse servidor e tente novamente.",403);
  if(!member.ok)return fail("Não foi possível verificar sua conta como membro do servidor (HTTP "+member.status+"). Confira a conta Discord vinculada.",403);
  const roles=new Set([guildId,...(member.data.roles||[])]);
  const perms=(guild.data.roles||[]).reduce((p,r)=>roles.has(r.id)?p|BigInt(r.permissions):p,0n);
  if(guild.data.owner_id!==user.discord_id&&!(perms&40n))return fail("Você não tem permissão para gerenciar este servidor.",403);
  if(!/^[a-f0-9]{64}$/i.test(app.data.verify_key||""))return fail("Chave pública indisponível.",502);
  const existing=await env.DB.prepare("SELECT id,owner_id FROM stores WHERE guild_id=?").bind(guildId).first();
  if(existing&&existing.owner_id!==user.id)return fail("Servidor já vinculado.",409);
  const storeId=existing?.id||crypto.randomUUID(),cipher=await seal(env,token);
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT INTO stores(id,owner_id,name,guild_id) VALUES(?,?,?,?) ON CONFLICT(guild_id) DO NOTHING").bind(storeId,user.id,String(guild.data.name||"Servidor").slice(0,100),guildId),
    env.DB.prepare("INSERT INTO custom_bots(store_id,application_id,bot_user_id,public_key,token_cipher,bot_name) VALUES(?,?,?,?,?,?) ON CONFLICT(store_id) DO UPDATE SET token_cipher=excluded.token_cipher,public_key=excluded.public_key,bot_name=excluded.bot_name,updated_at=CURRENT_TIMESTAMP WHERE custom_bots.application_id=excluded.application_id").bind(storeId,app.data.id,identity.data.id,app.data.verify_key,cipher,identity.data.username||"Bot")
   ]);
  }catch{return fail("Não foi possível vincular. Verifique se o bot ou servidor já está em uso.",409);}
  const linked=await env.DB.prepare("SELECT c.application_id FROM custom_bots c JOIN stores s ON s.id=c.store_id WHERE s.id=? AND s.owner_id=?").bind(storeId,user.id).first();
  if(linked?.application_id!==app.data.id)return fail("Já existe outro bot conectado.",409);
  return respond({success:true,store_id:storeId,interactions_url:url.origin+"/discord/interactions/"+app.data.id});
 }
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
