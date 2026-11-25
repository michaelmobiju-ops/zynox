export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/status") {
      return Response.json({
        name: "ZYNOX",
        status: "online",
        version: "1.0.0"
      });
    }

    if (url.pathname === "/api/config") {
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
          wallet: false,
          artificialIntelligence: false
        }
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "Rota não encontrada" },
        { status: 404 }
      );
    }

    try {
      return await env.ASSETS.fetch(request);
    } catch (error) {
      return new Response(
        "ZYNOX - Serviço temporariamente indisponível.",
        { status: 503 }
      );
    }
  }
};
