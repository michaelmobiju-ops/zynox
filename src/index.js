import {DurableObject} from "cloudflare:workers";
import {BotGateway as GatewayController} from "./bot-gateway.js";
export class BotGateway extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.controller=new GatewayController(ctx,env);}
  fetch(request){return this.controller.fetch(request);}
  alarm(){return this.controller.alarm();}
}
import {shield} from "./shield.js";
import {ownerMetrics,monitor} from "./operations.js";
import {publicApi} from "./public-api.js";
import {storefront} from "./storefront.js";
import {customBots,botIdentityForStore} from "./custom-bots.js";
import {ticketInteraction} from "./ticket-panels.js";
import {cart} from "./cart.js";
import {paymentWebhook} from "./payment-webhook.js";
import {commerce} from "./commerce.js";
import {
  discordLogin,
  discordCallback,
  getSession,
  logout
} from "./auth.js";

import { handleLicenses } from "./licenses.js";
import { adminLogin } from "./admin-auth.js";
import { handleControl } from "./control.js";
import { setupOwner } from "./owner.js";
import { handleDiscordLink } from "./discord-link.js";

const privateHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

function redirect(path) {
  return new Response(null, {
    status: 302,
    headers: {
      ...privateHeaders,
      Location: path
    }
  });
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: privateHeaders
  });
}

async function getSubscription(env, userId) {
  return await env.DB.prepare(`
    SELECT
      plan,
      status,
      expires_at,
      lifetime
    FROM subscriptions
    WHERE user_id = ?
      AND status = 'active'
      AND (
        lifetime = 1
        OR datetime(expires_at) > datetime('now')
      )
  `).bind(userId).first();
}

function isAdmin(user) {
  return user && (
    user.role === "owner" ||
    user.role === "admin"
  );
}

async function servePage(request, env, path) {
  const url = new URL(request.url);

  url.pathname = path;

  const response = await env.ASSETS.fetch(
    new Request(url.toString(), {
      method: request.method,
      headers: request.headers
    })
  );

  const headers = new Headers(response.headers);

  Object.entries(privateHeaders).forEach(
    ([key, value]) => headers.set(key, value)
  );

  return new Response(response.body, {
    status: response.status,
    headers
  });
}

async function storeChannels(request,env) {
 const url=new URL(request.url);

        if (request.method !== "GET") return json({error:"Método não permitido."},405);
        const user = await getSession(request,env);
        if (!user || !user.discord_id || (!isAdmin(user) && !await getSubscription(env,user.id))) return json({error:"Acesso restrito."},403);
        const stores = (await env.DB.prepare("SELECT id,name,guild_id FROM stores WHERE owner_id=?").bind(user.id).all()).results;
        const id = url.searchParams.get("store");
        if (!id) return json({stores});
        const store = stores.find(s=>s.id===id);
        if (!store) return json({error:"Loja não encontrada."},404);
        const guild = store.guild_id;
        const bot=await botIdentityForStore(env,store.id);
        if(!bot.token||!bot.id)return json({error:"Nenhum bot disponível para esta loja."},503);
        const call = p => fetch("https://discord.com/api/v10"+p,{headers:{Authorization:"Bot "+bot.token},signal:AbortSignal.timeout(8000)});
        const [gr,mr,br,cr] = await Promise.all([call("/guilds/"+guild),call("/guilds/"+guild+"/members/"+user.discord_id),call("/guilds/"+guild+"/members/"+bot.id),call("/guilds/"+guild+"/channels")]);
        if (![gr,mr,br,cr].every(r=>r.ok)) return json({error:"Servidor indisponível ou acesso removido."},403);
        const [g,m,b,channels] = await Promise.all([gr.json(),mr.json(),br.json(),cr.json()]);
        const base = member => g.roles.reduce((p,r)=>r.id===guild||member.roles.includes(r.id)?p|BigInt(r.permissions):p,0n);
        if (g.owner_id!==user.discord_id && !(base(m)&40n)) return json({error:"Sem permissão de gerenciamento."},403);
        function effective(member,id,ch) {
          let p=base(member);
          if (p&8n || g.owner_id===id) return -1n;
          const o=ch.permission_overwrites||[];
          const apply=(allow,deny)=>{p=(p&~deny)|allow;};
          const everyone=o.find(x=>x.id===guild);
          if(everyone) apply(BigInt(everyone.allow),BigInt(everyone.deny));
          let allow=0n,deny=0n;
          for(const x of o) if(x.type===0&&x.id!==guild&&member.roles.includes(x.id)){allow|=BigInt(x.allow);deny|=BigInt(x.deny);}
          apply(allow,deny);
          const own=o.find(x=>x.type===1&&x.id===id);
          if(own) apply(BigInt(own.allow),BigInt(own.deny));
          return p;
        }
        const required=19456n;
        return json({channels:channels.filter(c=>[0,5].includes(c.type)&&!String(c.topic||"").startsWith("ZYNOX_CART:")&&!String(c.name||"").startsWith("carrinho-")&&(effective(m,user.discord_id,c)&1024n)!==0n).map(c=>({id:c.id,name:c.name,available:(effective(b,bot.id,c)&required)===required}))});
      
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {

      if (path === "/api/checkout-version") return json({version:"checkout-v7"});
      if (path === "/api/monitor/health") return monitor(request,env);
      if (path === "/api/owner/metrics") return ownerMetrics(request,env);
      if (path.startsWith("/api/shield/")) return shield(request,env);
      if (path.startsWith("/api/v1/")) return publicApi(request,env);
      if (path.startsWith("/api/storefront/")) return storefront(request,env);
      if (/^\/loja\/[a-f0-9-]{36}\/?$/i.test(path)) return servePage(request,env,"/storefront.html");

      if (path === "/webhooks/payments") return await paymentWebhook(request,env);

      if (path === "/auth/discord/link" || path === "/auth/discord/link/callback") {
        return await handleDiscordLink(request, env);
      }

      // Discord HTTP interactions: authenticate the exact raw request.
      if (path === "/discord/interactions" || /^\/discord\/interactions\/[0-9]{17,22}$/.test(path)) {
        if (request.method !== "POST") return json({error:"Método não permitido."},405);
        const signature = request.headers.get("X-Signature-Ed25519") || "";
        const timestamp = request.headers.get("X-Signature-Timestamp") || "";
        if (!/^[a-f0-9]{128}$/i.test(signature) || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now()/1000-Number(timestamp))>300) return new Response("Unauthorized",{status:401});
        const raw = await request.text();
        const customApplicationId = path === "/discord/interactions" ? null : path.split("/").at(-1);
        let signingKey = "4f1047835760316dbc1a7606e9b7364f01921970bc1ecd0dd31a43c9d11f30b1";
        let customStore = null;
        if (customApplicationId) {
          try {
            customStore = await env.DB.prepare("SELECT cb.store_id,cb.public_key,s.guild_id FROM custom_bots cb JOIN stores s ON s.id=cb.store_id WHERE cb.application_id=?").bind(customApplicationId).first();
          } catch { return new Response("Custom bot not configured",{status:503}); }
          if (!customStore || !/^[a-f0-9]{64}$/i.test(customStore.public_key)) return new Response("Unauthorized",{status:401});
          signingKey = customStore.public_key;
        }
        const hex = s => Uint8Array.from(s.match(/../g), x => parseInt(x,16));
        try {
          const key = await crypto.subtle.importKey("raw",hex(signingKey),{name:"Ed25519"},false,["verify"]);
          if (!await crypto.subtle.verify("Ed25519",key,hex(signature),new TextEncoder().encode(timestamp+raw))) return new Response("Unauthorized",{status:401});
        } catch { return new Response("Unauthorized",{status:401}); }
        let interaction;
        try { interaction = JSON.parse(raw); } catch { return json({error:"JSON inválido."},400); }
        if (interaction.type === 1) return json({type:1});
        if (String(interaction.application_id) !== String(customApplicationId || env.DISCORD_CLIENT_ID)) return new Response("Unauthorized",{status:401});
        if (customStore && String(interaction.guild_id || "") !== String(customStore.guild_id)) return new Response("Unauthorized",{status:401});
        if(interaction.guild_id){
          const paused=await env.DB.prepare("SELECT c.enabled FROM server_controls c JOIN stores s ON s.id=c.store_id WHERE s.guild_id=?").bind(interaction.guild_id).first();
          if(paused&&paused.enabled===0)return json({type:4,data:{content:"ZYNOX está pausado neste servidor.",flags:64}});
        }
        if ([3,5].includes(interaction.type)) { const ticket=interaction.type===3?await ticketInteraction(interaction,env,ctx):null;if(ticket)return json(ticket);if(/^(buy:|pick:|choose:|checkout:|close:|copy-pix:|confirm-sale:|confirm-pix:)/.test(interaction.data?.custom_id||"")){
          ctx.waitUntil((async()=>{let result;try{result=await cart(interaction,env,ctx);}catch{}try{await fetch("https://discord.com/api/v10/webhooks/"+encodeURIComponent(interaction.application_id)+"/"+encodeURIComponent(interaction.token)+"/messages/@original",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:result?.data?.content||"Não foi possível abrir o carrinho.",components:result?.data?.components||[],allowed_mentions:{parse:[]}})});}catch{}})());
          return json({type:5,data:{flags:64}});
         } }
        const replies = {
          ping: "🏓 Pong! ZYNOX está respondendo.",
          zynox: "ZYNOX — plataforma de automação de vendas para Discord.",
          painel: "Acesse seu painel: https://zynox.michael-mobiju.workers.dev/dashboard",
          ajuda: "Comandos disponíveis: /ping, /zynox, /painel e /ajuda."
        };
        const name = interaction.data?.name;
        const content = interaction.type === 2 && Object.hasOwn(replies,name) ? replies[name] : "Interação ainda não disponível.";
        return json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
      }

      // LOGIN COM DISCORD

      if (
        path === "/auth/discord" &&
        request.method === "GET"
      ) {
        return discordLogin(env);
      }

      if (
        path === "/auth/discord/callback" &&
        request.method === "GET"
      ) {
        return await discordCallback(request, env);
      }

      // LOGIN ADMINISTRATIVO

      if (path === "/api/auth/admin") {
        return await adminLogin(request, env);
      }

      // CRIAÇÃO DA CONTA DONO

      if (path === "/api/setup/owner") {
        return await setupOwner(request, env);
      }

      // PÁGINA TEMPORÁRIA DE CADASTRO

      if (
        path === "/setup" ||
        path === "/setup/" ||
        path === "/setup.html"
      ) {
        if (request.method !== "GET") {
          return json({
            error: "Método não permitido."
          }, 405);
        }

        const owner = await env.DB.prepare(`
          SELECT id
          FROM users
          WHERE role = 'owner'
          LIMIT 1
        `).first();

        if (owner) {
          return redirect("/");
        }

        if (
          !env.OWNER_USERNAME ||
          !env.OWNER_PASSWORD ||
          !env.PASSWORD_PEPPER ||
          !env.LOGIN_RATE_LIMITER
        ) {
          return json({
            error: "Configuração inicial indisponível."
          }, 503);
        }

        return await servePage(
          request,
          env,
          "/setup"
        );
      }

      // ENCERRAR SESSÃO

      if (path === "/auth/logout") {
        if (request.method !== "POST") {
          return json({
            error: "Método não permitido."
          }, 405);
        }

        if (
          request.headers.get("Origin") !== url.origin
        ) {
          return json({
            error: "Acesso negado."
          }, 403);
        }

        return await logout(request, env);
      }

      // USUÁRIO AUTENTICADO

      if (path === "/api/me") {
        if (request.method !== "GET") {
          return json({
            error: "Método não permitido."
          }, 405);
        }

        const user = await getSession(request, env);

        if (!user) {
          return json({
            authenticated: false
          }, 401);
        }

        const subscription =
          await getSubscription(env, user.id);

        return json({authenticated:true,user,subscription,discord_profile:null});
      }

      if (path === "/api/me/profile") {
        if(request.method!=="GET")return json({error:"Método não permitido."},405);
        const user=await getSession(request,env);
        if(!user)return json({error:"Autenticação necessária."},401);
        let discord_profile=null;
        if(user.discord_id&&env.DISCORD_BOT_TOKEN){
          try{
            const response=await fetch("https://discord.com/api/v10/users/"+encodeURIComponent(user.discord_id),{headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN},signal:AbortSignal.timeout(3500)});
            if(response.ok){
              const d=await response.json();
              discord_profile={display_name:d.global_name||d.username,avatar_url:d.avatar?"https://cdn.discordapp.com/avatars/"+d.id+"/"+d.avatar+(d.avatar.startsWith("a_")?".gif?size=256":".png?size=256"):null,banner_url:d.banner?"https://cdn.discordapp.com/banners/"+d.id+"/"+d.banner+(d.banner.startsWith("a_")?".gif?size=1024":".png?size=1024"):null};
            }
          }catch{}
        }
        return json({discord_profile});
      }

      // ZYNOX CONTROL

      if (path.startsWith("/api/control/")) {
        return await handleControl(request, env);
      }

      // SISTEMA DE LICENÇAS

      if (
        path === "/api/licenses/redeem" ||
        path.startsWith("/api/owner/licenses/")
      ) {
        return await handleLicenses(
          request,
          env
        );
      }

      // Verificação do bot, exclusiva do proprietário.
      if (path === "/api/owner/discord/status") {
        if (request.method !== "GET") return json({error:"Método não permitido."},405);
        const user = await getSession(request, env);
        if (!user) return json({error:"Autenticação necessária."},401);
        if (user.role !== "owner") return json({error:"Acesso restrito."},403);
        if (!env.DISCORD_BOT_TOKEN) return json({connected:false,error:"Token não configurado."},503);
        try {
          const response = await fetch("https://discord.com/api/v10/users/@me", {
            headers: {Authorization: "Bot " + env.DISCORD_BOT_TOKEN},
            signal: AbortSignal.timeout(8000)
          });
          if (!response.ok) return json({connected:false,error:"Discord recusou a conexão.",discordStatus:response.status},502);
          const bot = await response.json();
          if (!bot.bot || bot.id !== env.DISCORD_CLIENT_ID) return json({connected:false,error:"Token de outra aplicação."},409);
          return json({connected:true,bot:{id:bot.id,username:bot.username}});
        } catch {
          return json({connected:false,error:"Discord indisponível."},502);
        }
      }

      if (path === "/api/owner/discord/commands") {
        if (request.method !== "POST") return json({error:"Método não permitido."},405);
        if (request.headers.get("Origin") !== url.origin) return json({error:"Acesso negado."},403);
        const user = await getSession(request,env);
        if (!user || user.role !== "owner") return json({error:"Acesso restrito."},403);
        if (!env.DISCORD_BOT_TOKEN) return json({error:"Token não configurado."},503);
        const commands = [
          {name:"ping",description:"Testar a conexão da ZYNOX"},
          {name:"zynox",description:"Conhecer a plataforma ZYNOX"},
          {name:"painel",description:"Acessar o painel da ZYNOX"},
          {name:"ajuda",description:"Consultar os comandos disponíveis"}
        ];
        const headers = {Authorization:"Bot "+env.DISCORD_BOT_TOKEN,"Content-Type":"application/json"};
        const base = "https://discord.com/api/v10/applications/"+env.DISCORD_CLIENT_ID+"/commands";
        const registered = [];
        for (const command of commands) {
          const response = await fetch(base,{method:"POST",headers,body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});
          if (!response.ok) return json({error:"Falha ao registrar /"+command.name,registered,discordStatus:response.status},502);
          registered.push(command.name);
        }
        return json({success:true,registered});
      }

      // List installed guilds only for users with verified management rights.
      if(path==="/api/server-controls"||path==="/api/server-controls/action"){
        const user=await getSession(request,env);
        if(!user||(!isAdmin(user)&&!await getSubscription(env,user.id)))return json({error:"Acesso restrito."},403);
        if(path==="/api/server-controls"&&request.method==="GET"){
          let stores,controls_ready=true;
          try{
            stores=(await env.DB.prepare("SELECT s.id,s.name,s.guild_id,s.created_at,COALESCE(c.enabled,1) AS enabled,c.enabled_since,c.removed_at FROM stores s LEFT JOIN server_controls c ON c.store_id=s.id WHERE s.owner_id=? ORDER BY s.name").bind(user.id).all()).results;
          }catch(error){
            if(!String(error).includes("server_controls"))throw error;
            controls_ready=false;
            stores=(await env.DB.prepare("SELECT id,name,guild_id,created_at,1 AS enabled,NULL AS enabled_since,NULL AS removed_at FROM stores WHERE owner_id=? ORDER BY name").bind(user.id).all()).results;
          }
          if(env.DISCORD_BOT_TOKEN){
            await Promise.all(stores.map(async store=>{
              try{
                const response=await fetch("https://discord.com/api/v10/guilds/"+encodeURIComponent(store.guild_id),{headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN},signal:AbortSignal.timeout(4500)});
                if(!response.ok)return;
                const guild=await response.json();
                if(guild.icon)store.icon_url="https://cdn.discordapp.com/icons/"+store.guild_id+"/"+encodeURIComponent(guild.icon)+".png?size=128";
              }catch{}
            }));
          }
          return json({stores,controls_ready,bot_mode:"http",presence_supported:false});
        }
        if(!user.discord_id||path!=="/api/server-controls/action"||request.method!=="POST"||request.headers.get("Origin")!==url.origin)return json({error:"Acesso negado."},403);
        let body;try{body=await request.json();}catch{return json({error:"Dados inválidos."},400);}
        const store=await env.DB.prepare("SELECT id,guild_id FROM stores WHERE id=? AND owner_id=?").bind(String(body.store_id||""),user.id).first();
        if(!store)return json({error:"Servidor não encontrado."},404);
        if(!["pause","resume","leave"].includes(body.action))return json({error:"Ação inválida."},400);
        const call=(p,method="GET")=>fetch("https://discord.com/api/v10"+p,{method,headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN},signal:AbortSignal.timeout(8000)});
        const [gr,mr]=await Promise.all([call("/guilds/"+store.guild_id),call("/guilds/"+store.guild_id+"/members/"+user.discord_id)]);
        if(!gr.ok||!mr.ok)return json({error:"Servidor indisponível."},403);
        const g=await gr.json(),m=await mr.json();
        const perms=g.roles.reduce((p,r)=>r.id===g.id||m.roles.includes(r.id)?p|BigInt(r.permissions):p,0n);
        if(g.owner_id!==user.discord_id&&!(perms&40n))return json({error:"Sem permissão de gerenciamento."},403);
        if(body.action==="leave"){
          if(body.confirm!==true)return json({error:"Confirme a remoção."},400);
          const res=await call("/users/@me/guilds/"+store.guild_id,"DELETE");
          if(!res.ok)return json({error:"Discord recusou a remoção."},502);
          await env.DB.prepare("INSERT INTO server_controls(store_id,enabled,removed_at) VALUES(?,0,datetime('now')) ON CONFLICT(store_id) DO UPDATE SET enabled=0,removed_at=datetime('now')").bind(store.id).run();
          return json({success:true});
        }
        const enabled=body.action==="resume"?1:0;
        await env.DB.prepare("INSERT INTO server_controls(store_id,enabled,enabled_since) VALUES(?,?,datetime('now')) ON CONFLICT(store_id) DO UPDATE SET enabled=excluded.enabled,enabled_since=CASE WHEN excluded.enabled=1 AND server_controls.enabled=0 THEN datetime('now') ELSE server_controls.enabled_since END,removed_at=NULL").bind(store.id,enabled).run();
        return json({success:true,enabled:Boolean(enabled)});
      }

      if(path==="/api/discord/my-guilds"){
        if(request.method!=="GET")return json({error:"Método não permitido."},405);
        const user=await getSession(request,env);
        if(!user)return json({error:"Autenticação necessária."},401);
        if(!isAdmin(user)&&!await getSubscription(env,user.id))return json({error:"Assinatura necessária."},403);
        const row=await env.DB.prepare("SELECT guilds_json FROM discord_guild_cache WHERE user_id=? AND datetime(expires_at)>datetime('now')").bind(user.id).first();
        return json({servers:row?JSON.parse(row.guilds_json):[],needsAuthorization:!row});
      }
      if (path === "/api/discord/servers") {
        if (request.method !== "GET") return json({error:"Método não permitido."},405);
        const user = await getSession(request,env);
        if (!user) return json({error:"Autenticação necessária."},401);
        if (!isAdmin(user) && !await getSubscription(env,user.id)) return json({error:"Assinatura necessária."},403);
        if (!user.discord_id) return json({servers:[],needsDiscord:true});
        if (!env.DISCORD_BOT_TOKEN) return json({error:"Bot indisponível."},503);
        const headers = {Authorization:"Bot "+env.DISCORD_BOT_TOKEN};
        const call = async path => fetch("https://discord.com/api/v10"+path,{headers,signal:AbortSignal.timeout(8000)});
        const response = await call("/users/@me/guilds?limit=200");
        if (!response.ok) return json({error:"Não foi possível consultar servidores."},502);
        const guilds = await response.json();
        const servers = [];
        for (const guild of guilds.slice(0,20)) {
          const memberResponse = await call("/guilds/"+guild.id+"/members/"+user.discord_id);
          if (!memberResponse.ok) continue;
          const member = await memberResponse.json();
          const detailResponse = await call("/guilds/"+guild.id);
          if (!detailResponse.ok) continue;
          const detail = await detailResponse.json();
          const roles = new Set([guild.id,...member.roles]);
          const permissions = detail.roles.reduce((p,role)=>roles.has(role.id)?p|BigInt(role.permissions):p,0n);
          if (detail.owner_id !== user.discord_id && !(permissions & 40n)) continue;
          const store = await env.DB.prepare("SELECT owner_id FROM stores WHERE guild_id=?").bind(guild.id).first();
          if (store && store.owner_id !== user.id) continue;
          servers.push({id:guild.id,name:guild.name,linked:!!store});
        }
        return json({servers,limited:guilds.length>20});
      }

      if (path === "/api/discord/store/link") {
        if (request.method !== "POST") return json({error:"Método não permitido."},405);
        if (request.headers.get("Origin") !== url.origin) return json({error:"Acesso negado."},403);
        const user = await getSession(request,env);
        if (!user || !user.discord_id || (!isAdmin(user) && !await getSubscription(env,user.id))) return json({error:"Acesso restrito."},403);
        let body;
        try { body = await request.json(); } catch { return json({error:"Dados inválidos."},400); }
        const guild = String(body.guild_id || "");
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!/^\d{17,20}$/.test(guild) || !name || name.length>100) return json({error:"Servidor ou nome inválido."},400);
        if (!env.DISCORD_BOT_TOKEN) return json({error:"Bot indisponível."},503);
        const headers = {Authorization:"Bot "+env.DISCORD_BOT_TOKEN};
        const call = p => fetch("https://discord.com/api/v10"+p,{headers,signal:AbortSignal.timeout(8000)});
        const [mr,gr] = await Promise.all([call("/guilds/"+guild+"/members/"+user.discord_id),call("/guilds/"+guild)]);
        if (!mr.ok || !gr.ok) return json({error:"Servidor não autorizado ou indisponível."},403);
        const member = await mr.json(), detail = await gr.json();
        const roles = new Set([guild,...member.roles]);
        const permissions = detail.roles.reduce((p,role)=>roles.has(role.id)?p|BigInt(role.permissions):p,0n);
        if (detail.owner_id !== user.discord_id && !(permissions & 40n)) return json({error:"Sem permissão para gerenciar servidor."},403);
        await env.DB.prepare("INSERT INTO stores (id,owner_id,name,guild_id) VALUES (?,?,?,?) ON CONFLICT(guild_id) DO NOTHING").bind(crypto.randomUUID(),user.id,name,guild).run();
        const store = await env.DB.prepare("SELECT id,name,owner_id FROM stores WHERE guild_id=?").bind(guild).first();
        if (!store || store.owner_id !== user.id) return json({error:"Servidor já vinculado a outra loja."},409);
        return json({success:true,store:{id:store.id,name:store.name}});
      }

      if (path === "/api/dashboard/summary") {
        if(request.method!=="GET")return json({error:"Método não permitido."},405);
        const user=await getSession(request,env);
        if(!user)return json({error:"Autenticação necessária."},401);
        if(!isAdmin(user)&&!await getSubscription(env,user.id))return json({error:"Assinatura necessária."},403);
        const id=url.searchParams.get("store")||"";
        const stores=(await env.DB.prepare("SELECT id,name FROM stores WHERE owner_id=? ORDER BY name").bind(user.id).all()).results;
        if(id&&!stores.some(s=>s.id===id))return json({error:"Loja não encontrada."},404);
        const scope="SELECT id FROM stores WHERE owner_id=? AND (?='' OR id=?)";
        const query=sql=>env.DB.prepare(sql.replaceAll("STORE_SCOPE",scope)).bind(user.id,id,id);
        const [orders,products,customers,days,recent]=await Promise.all([
          query("SELECT count(*) AS orders,COALESCE(SUM(CASE WHEN status IN ('paid','delivering','delivered') THEN total_cents ELSE 0 END),0) AS revenue_cents,COALESCE(SUM(CASE WHEN status IN ('paid','delivering','delivered') THEN 1 ELSE 0 END),0) AS sales FROM orders WHERE store_id IN (STORE_SCOPE)").first(),
          query("SELECT count(*) AS total FROM products WHERE status='active' AND store_id IN (STORE_SCOPE)").first(),
          query("SELECT count(*) AS total FROM customers WHERE store_id IN (STORE_SCOPE)").first(),
          query("SELECT date(paid_at) AS day,sum(total_cents) AS cents,count(*) AS sales FROM orders WHERE store_id IN (STORE_SCOPE) AND status IN ('paid','delivering','delivered') AND date(paid_at) BETWEEN date('now','-6 days') AND date('now') GROUP BY date(paid_at) ORDER BY day").all(),
          query("SELECT o.id,o.status,o.total_cents,o.created_at,p.name AS product_name,s.name AS store_name FROM orders o JOIN variants v ON v.id=o.variant_id JOIN products p ON p.id=v.product_id JOIN stores s ON s.id=o.store_id WHERE o.store_id IN (STORE_SCOPE) ORDER BY o.created_at DESC LIMIT 8").all()
        ]);
        return json({stores,metrics:{...orders,products:products.total,customers:customers.total},days:days.results,recent:recent.results});
      }

      if(path.startsWith("/media/sales/")&&request.method==="GET"){
        if(!env.SALE_IMAGES)return new Response("Imagem indisponível.",{status:404});
        const name=path.slice("/media/sales/".length);
        if(!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(name))return new Response("Imagem inválida.",{status:400});
        const object=await env.SALE_IMAGES.get(name);
        if(!object)return new Response("Imagem não encontrada.",{status:404});
        return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType||"application/octet-stream","Cache-Control":"public,max-age=86400","X-Content-Type-Options":"nosniff"}});
      }
      if(path==="/api/media/sales"&&request.method==="POST"){
        if(request.headers.get("Origin")!==url.origin)return json({error:"Acesso negado."},403);
        const user=await getSession(request,env);if(!user)return json({error:"Autenticação necessária."},401);
        if(!env.SALE_IMAGES)return json({error:"Configure o bucket R2 SALE_IMAGES na Cloudflare para enviar imagens."},503);
        const storeId=url.searchParams.get("store")||"";
        const store=await env.DB.prepare("SELECT id FROM stores WHERE id=? AND owner_id=?").bind(storeId,user.id).first();
        if(!store)return json({error:"Loja não autorizada."},403);
        const type=request.headers.get("Content-Type")||"";
        const mime={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif"};
        if(!mime[type])return json({error:"Envie PNG, JPG, WEBP ou GIF."},415);
        const length=Number(request.headers.get("Content-Length")||0);
        if(length>5*1024*1024)return json({error:"Imagem deve ter no máximo 5 MB."},413);
        const bytes=await request.arrayBuffer();
        if(bytes.byteLength>5*1024*1024||bytes.byteLength<10)return json({error:"Tamanho inválido."},413);
        const signature=new Uint8Array(bytes.slice(0,16));
        const valid=(type==="image/png"&&signature[0]===137&&signature[1]===80&&signature[2]===78&&signature[3]===71)||(type==="image/jpeg"&&signature[0]===255&&signature[1]===216&&signature[2]===255)||(type==="image/gif"&&signature[0]===71&&signature[1]===73&&signature[2]===70)||(type==="image/webp"&&String.fromCharCode(...signature.slice(0,4))==="RIFF"&&String.fromCharCode(...signature.slice(8,12))==="WEBP");
        if(!valid)return json({error:"Formato de imagem inválido."},415);
        const key=crypto.randomUUID()+"."+mime[type];
        await env.SALE_IMAGES.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{storeId}});
        return json({url:url.origin+"/media/sales/"+key});
      }
      if (path.startsWith("/api/custom-bot/")) return customBots(request,env,ctx);
      if (path === "/api/store/channels") return storeChannels(request,env);
      if (path.startsWith("/api/commerce/")) return await commerce(request,env,storeChannels);

      if (path === "/api/notifications" || path === "/api/notifications/read") {
        const user = await getSession(request, env);
        if (!user) return json({error:"Autenticação necessária."},401);
        if (path === "/api/notifications" && request.method === "GET") {
          const items = (await env.DB.prepare("SELECT id,title,message,is_read,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all()).results;
          const count = await env.DB.prepare("SELECT count(*) AS total FROM notifications WHERE user_id=? AND is_read=0").bind(user.id).first();
          return json({items,unread:count.total});
        }
        if (path === "/api/notifications/read" && request.method === "POST") {
          if(request.headers.get("Origin")!==url.origin)return json({error:"Acesso negado."},403);
          let body;try{body=await request.json();}catch{return json({error:"Dados inválidos."},400);}
          if(body?.all===true)await env.DB.prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").bind(user.id).run();
          else if(typeof body?.id==="string"&&body.id.length<=128)await env.DB.prepare("UPDATE notifications SET is_read=1 WHERE user_id=? AND id=?").bind(user.id,body.id).run();
          else return json({error:"Notificação inválida."},400);
          return json({success:true});
        }
        return json({error:"Método não permitido."},405);
      }

      if (path === "/api/support") {
        const user=await getSession(request,env);
        if(!user)return json({error:"Autenticação necessária."},401);
        if(request.method==="GET"){
          const items=(await env.DB.prepare("SELECT id,subject,message,status,created_at FROM support_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all()).results;
          return json({items});
        }
        if(request.method==="POST"){
          if(request.headers.get("Origin")!==url.origin)return json({error:"Acesso negado."},403);
          let body;try{body=await request.json();}catch{return json({error:"Dados inválidos."},400);}
          const subject=typeof body?.subject==="string"?body.subject.trim():"",message=typeof body?.message==="string"?body.message.trim():"";
          if(!subject||subject.length>120||message.length<10||message.length>3000)return json({error:"Informe assunto e descrição (10 a 3000 caracteres)."},400);
          const id=crypto.randomUUID();
          const result=await env.DB.prepare("INSERT INTO support_requests(id,user_id,subject,message) SELECT ?,?,?,? WHERE (SELECT count(*) FROM support_requests WHERE user_id=? AND status='open')<5").bind(id,user.id,subject,message,user.id).run();
          if(!result.meta.changes)return json({error:"Limite de cinco chamados abertos."},409);
          return json({success:true,id},201);
        }
        return json({error:"Método não permitido."},405);
      }
      if(path==="/api/ai/status"){
        if(request.method!=="GET")return json({error:"Método não permitido."},405);
        const user=await getSession(request,env);
        if(!user)return json({error:"Autenticação necessária."},401);
        return json({available:false,message:"A integração de inteligência artificial ainda não foi habilitada."});
      }

      // STATUS DO SERVIDOR

      if (path === "/api/status") {
        await env.DB.prepare(
          "SELECT 1"
        ).first();

        return json({
          name: "ZYNOX",
          status: "online",
          database: "connected",
          version: "1.5.1"
        });
      }

      // CONFIGURAÇÕES PÚBLICAS

      if (path === "/api/config") {
        return json({
          name: "ZYNOX",

          description:
            "Automação de vendas para Discord",

          theme: {
            primary: "#7135FF",
            secondary: "#C084FC",
            background: "#08080B",
            text: "#FFFFFF"
          },

          features: {
            products: false,
            payments: false,
            discord: false,
            discordLogin: true,
            licenses: true,
            adminLogin: true,
            control: true,
            wallet: false,
            artificialIntelligence: false
          }
        });
      }

      // DASHBOARD PROTEGIDO

      if (
        path === "/dashboard" ||
        path === "/dashboard/" ||
        path === "/dashboard.html"
      ) {
        const user = await getSession(request, env);

        if (!user) {
          return redirect("/");
        }

        const subscription =
          await getSubscription(env, user.id);

        if (!isAdmin(user) && !subscription) {
          return redirect("/plans");
        }

        return await servePage(
          request,
          env,
          "/dashboard"
        );
      }

      // PÁGINA DE ASSINATURAS

      if (
        path === "/plans" ||
        path === "/plans/" ||
        path === "/plans.html"
      ) {
        const user = await getSession(request, env);

        if (!user) {
          return redirect("/");
        }

        const subscription =
          await getSubscription(env, user.id);

        if (isAdmin(user) || subscription) {
          return redirect("/dashboard");
        }

        return await servePage(
          request,
          env,
          "/plans"
        );
      }

      // PROTEÇÃO ADMINISTRATIVA

      if (
        path.startsWith("/api/admin/") ||
        path.startsWith("/api/owner/")
      ) {
        const user = await getSession(request, env);

        if (!user) {
          return json({
            error: "Autenticação necessária."
          }, 401);
        }

        if (!isAdmin(user)) {
          return json({
            error: "Acesso restrito."
          }, 403);
        }

        if (
          path.startsWith("/api/owner/") &&
          user.role !== "owner"
        ) {
          return json({
            error: "Acesso exclusivo do DONO."
          }, 403);
        }

        return json({
          error: "Funcionalidade ainda indisponível."
        }, 501);
      }

      // ROTAS INEXISTENTES

      if (
        path.startsWith("/api/") ||
        path.startsWith("/auth/")
      ) {
        return json({
          error: "Rota não encontrada."
        }, 404);
      }

      // ARQUIVOS DO SITE

      return await env.ASSETS.fetch(request);

    } catch (error) {
      console.error(
        "ZYNOX:",
        error.name
      );

      return json({
        error: "Erro interno do servidor."
      }, 500);
    }
  }
};
