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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {

      // Discord HTTP interactions: authenticate the exact raw request.
      if (path === "/discord/interactions") {
        if (request.method !== "POST") return json({error:"Método não permitido."},405);
        const signature = request.headers.get("X-Signature-Ed25519") || "";
        const timestamp = request.headers.get("X-Signature-Timestamp") || "";
        if (!/^[a-f0-9]{128}$/i.test(signature) || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now()/1000-Number(timestamp))>300) return new Response("Unauthorized",{status:401});
        const raw = await request.text();
        const hex = s => Uint8Array.from(s.match(/../g), x => parseInt(x,16));
        try {
          const key = await crypto.subtle.importKey("raw",hex("4f1047835760316dbc1a7606e9b7364f01921970bc1ecd0dd31a43c9d11f30b1"),{name:"Ed25519"},false,["verify"]);
          if (!await crypto.subtle.verify("Ed25519",key,hex(signature),new TextEncoder().encode(timestamp+raw))) return new Response("Unauthorized",{status:401});
        } catch { return new Response("Unauthorized",{status:401}); }
        let interaction;
        try { interaction = JSON.parse(raw); } catch { return json({error:"JSON inválido."},400); }
        if (interaction.type === 1) return json({type:1});
        if (interaction.application_id !== env.DISCORD_CLIENT_ID) return new Response("Unauthorized",{status:401});
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

        return json({
          authenticated: true,
          user,
          subscription
        });
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
