import {
  discordLogin,
  discordCallback,
  getSession,
  logout
} from "./auth.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/auth/discord" && request.method === "GET") {
        return discordLogin(env);
      }

      if (path === "/auth/discord/callback" && request.method === "GET") {
        return await discordCallback(request, env);
      }

      if (path === "/auth/logout" && request.method === "POST") {
        if (request.headers.get("Origin") !== url.origin) {
          return new Response("Acesso negado.", {
            status: 403
          });
        }

        return await logout(request, env);
      }

      if (path === "/api/me") {
        const user = await getSession(request, env);

        if (!user) {
          return Response.json({
            authenticated: false
          }, {
            status: 401,
            headers: { "Cache-Control": "no-store" }
          });
        }

        const subscription = await env.DB.prepare(`
          SELECT plan, status, expires_at, lifetime
          FROM subscriptions
          WHERE user_id = ?
            AND status = 'active'
            AND (
              lifetime = 1
              OR datetime(expires_at) > datetime('now')
            )
        `).bind(user.id).first();

        return Response.json({
          authenticated: true,
          user,
          subscription
        }, {
          headers: { "Cache-Control": "no-store" }
        });
      }

      if (path === "/api/status") {
        await env.DB.prepare("SELECT 1").first();

        return Response.json({
          name: "ZYNOX",
          status: "online",
          database: "connected",
          version: "1.1.0"
        });
      }

      if (path === "/api/config") {
        return Response.json({
          name: "ZYNOX",
          description: "Automação de vendas para Discord",
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
            wallet: false,
            artificialIntelligence: false
          }
        });
      }

      if (path.startsWith("/api/")) {
        return Response.json({
          error: "Rota não encontrada"
        }, { status: 404 });
      }

      return await env.ASSETS.fetch(request);

    } catch (error) {
      console.error("ZYNOX:", error.name);

      return Response.json({
        error: "Erro interno do servidor."
      }, {
        status: 500,
        headers: { "Cache-Control": "no-store" }
      });
    }
  }
};
