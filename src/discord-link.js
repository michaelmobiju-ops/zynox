import { getSession, saveDiscordGuilds } from "./auth.js";

const API = "https://discord.com/api/v10";

function randomState() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    b => b.toString(16).padStart(2, "0")
  ).join("");
}

function cookie(request, name) {
  return (request.headers.get("Cookie") || "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(name + "="))
    ?.slice(name.length + 1);
}

async function sign(value, env) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.DISCORD_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return Array.from(
    new Uint8Array(bytes),
    b => b.toString(16).padStart(2, "0")
  ).join("");
}

export async function handleDiscordLink(request, env) {
  const url = new URL(request.url);
  const user = await getSession(request, env);

  if (request.method !== "GET") {
    return new Response("Método não permitido.", {
      status: 405
    });
  }

  if (!user || !["owner", "admin","subscriber"].includes(user.role)) {
    return new Response("Acesso restrito.", {
      status: 403
    });
  }

  const redirectUri =
    url.origin + "/auth/discord/link/callback";

  if (url.pathname === "/auth/discord/link") {
    const state = randomState();
    const expires = Date.now() + 600000;
    const signature = await sign(
      state + ":" + user.id + ":" + expires,
      env
    );

    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify guilds",
      state
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location:
          "https://discord.com/oauth2/authorize?" +
          params.toString(),
        "Set-Cookie":
          "zynox_link=" +
          [state, expires, signature].join(".") +
          "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
        "Cache-Control": "no-store"
      }
    });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const [savedState, expires, signature] =
    (cookie(request, "zynox_link") || "").split(".");

  if (
    !code ||
    !state ||
    state !== savedState ||
    !expires ||
    !signature ||
    !Number.isFinite(Number(expires)) ||
    Number(expires) < Date.now()
  ) {
    return new Response("Autorização inválida.", {
      status: 400
    });
  }

  const expected = await sign(
    state + ":" + user.id + ":" + expires,
    env
  );

  if (expected !== signature) {
    return new Response("Sessão inválida.", {
      status: 403
    });
  }

  const tokenResponse = await fetch(
    API + "/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    }
  );

  if (!tokenResponse.ok) {
    return new Response("Falha na autorização.", {
      status: 400
    });
  }

  const token = await tokenResponse.json();

  const profileResponse = await fetch(
    API + "/users/@me",
    {
      headers: {
        Authorization: "Bearer " + token.access_token
      }
    }
  );

  if (!profileResponse.ok) {
    return new Response("Perfil indisponível.", {
      status: 400
    });
  }

  const profile = await profileResponse.json();

  const result = await env.DB.prepare(`
    UPDATE users
    SET discord_id = ?
    WHERE id = ?
      AND role IN ('owner', 'admin','subscriber')
      AND status = 'active'
      AND (discord_id IS NULL OR discord_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM users
        WHERE discord_id = ?
          AND id != ?
      )
  `).bind(
    profile.id,
    user.id,
    profile.id,
    profile.id,
    user.id
  ).run();

  if (!result.meta.changes) {
    return new Response(
      "Discord já vinculado ou conta indisponível.",
      { status: 409 }
    );
  }

  await saveDiscordGuilds(env,user.id,token.access_token);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/dashboard",
      "Set-Cookie":
        "zynox_link=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "Cache-Control": "no-store"
    }
  });
}
