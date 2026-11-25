const API = "https://discord.com/api/v10";

function randomToken() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

async function hashToken(token) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(
    new Uint8Array(bytes),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";

  return cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(name + "="))
    ?.slice(name.length + 1);
}

export function discordLogin(env) {
  const state = randomToken();

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
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
        "zynox_state=" + state +
        "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600",

      "Cache-Control": "no-store"
    }
  });
}

export async function discordCallback(request, env) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, "zynox_state");

  if (!code || !state || !savedState || state !== savedState) {
    return new Response("Autorização inválida.", {
      status: 400
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
        redirect_uri: env.DISCORD_REDIRECT_URI
      })
    }
  );

  if (!tokenResponse.ok) {
    return new Response(
      "Falha na autenticação com Discord.",
      { status: 401 }
    );
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
    return new Response(
      "Não foi possível consultar o perfil.",
      { status: 401 }
    );
  }

  const profile = await profileResponse.json();

  await env.DB.prepare(`
    INSERT INTO users (
      id, discord_id, username, role, status
    )
    VALUES (?, ?, ?, 'subscriber', 'active')
    ON CONFLICT(discord_id)
    DO UPDATE SET username = excluded.username
  `).bind(
    crypto.randomUUID(),
    profile.id,
    profile.username
  ).run();

  const user = await env.DB.prepare(`
    SELECT id, role, status
    FROM users
    WHERE discord_id = ?
  `).bind(profile.id).first();

  if (!user || user.status !== "active") {
    return new Response(
      "Acesso suspenso ou indisponível.",
      { status: 403 }
    );
  }

  const session = randomToken();
  const sessionHash = await hashToken(session);

  const expires = new Date(
    Date.now() + 86400000
  ).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions (
      token_hash, user_id, expires_at
    )
    VALUES (?, ?, ?)
  `).bind(
    sessionHash,
    user.id,
    expires
  ).run();

  const subscription = await env.DB.prepare(`
    SELECT plan
    FROM subscriptions
    WHERE user_id = ?
      AND status = 'active'
      AND (
        lifetime = 1
        OR datetime(expires_at) > datetime('now')
      )
  `).bind(user.id).first();

  const destination =
    subscription ? "/dashboard" : "/plans";

  const headers = new Headers({
    Location: destination,
    "Cache-Control": "no-store"
  });

  headers.append(
    "Set-Cookie",
    "zynox_session=" + session +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400"
  );

  headers.append(
    "Set-Cookie",
    "zynox_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );

  return new Response(null, {
    status: 302,
    headers
  });
}

export async function getSession(request, env) {
  const token = getCookie(request, "zynox_session");

  if (!token) return null;

  const hash = await hashToken(token);

  return await env.DB.prepare(`
    SELECT users.id,
           users.username,
           users.discord_id,
           users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND datetime(sessions.expires_at) > datetime('now')
      AND users.status = 'active'
  `).bind(hash).first();
}

export async function logout(request, env) {
  const token = getCookie(request, "zynox_session");

  if (token) {
    await env.DB.prepare(`
      DELETE FROM sessions
      WHERE token_hash = ?
    `).bind(await hashToken(token)).run();
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie":
        "zynox_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "Cache-Control": "no-store"
    }
  });
}
