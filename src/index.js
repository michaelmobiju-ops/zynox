import {
  discordLogin,
  discordCallback,
  getSession,
  logout
} from "./auth.js";

import {
  handleLicenses
} from "./licenses.js";

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
    SELECT plan, status, expires_at, lifetime
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

      // STATUS DO SERVIDOR

      if (path === "/api/status") {
        await env.DB.prepare(
          "SELECT 1"
        ).first();

        return json({
          name: "ZYNOX",
          status: "online",
          database: "connected",
          version: "1.3.0"
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
            adminLogin: false,
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
            error:
              "Acesso exclusivo do proprietário."
          }, 403);
        }

        return json({
          error:
            "Funcionalidade ainda indisponível."
        }, 501);
      }

      // ROTAS INEXISTENTES

      if (path.startsWith("/api/")) {
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
