const encoder = new TextEncoder();

const ITERATIONS = 100000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function randomHex(size = 32) {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(size)),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256(value) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );

  return Array.from(
    new Uint8Array(result),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

function secureCompare(a, b) {
  if (a.length !== b.length) return false;

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |=
      a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

export async function hashPassword(
  password,
  env,
  salt = randomHex(32)
) {
  if (!env.PASSWORD_PEPPER) {
    throw new Error("Segredo não configurado.");
  }

  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(
      password + "\0" + env.PASSWORD_PEPPER
    ),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    material,
    256
  );

  const hash = Array.from(
    new Uint8Array(result),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");

  return [
    "pbkdf2",
    ITERATIONS,
    salt,
    hash
  ].join("$");
}

export async function verifyPassword(
  password,
  stored,
  env
) {
  if (!stored) return false;

  const parts = stored.split("$");

  if (
    parts.length !== 4 ||
    parts[0] !== "pbkdf2" ||
    Number(parts[1]) !== ITERATIONS
  ) {
    return false;
  }

  const calculated = await hashPassword(
    password,
    env,
    parts[2]
  );

  return secureCompare(
    calculated,
    stored
  );
}

export async function adminLogin(request, env) {
  const url = new URL(request.url);

  if (request.method !== "POST") {
    return json({
      error: "Método não permitido."
    }, 405);
  }

  if (
    request.headers.get("Origin") !== url.origin
  ) {
    return json({
      error: "Origem não autorizada."
    }, 403);
  }

  if (
    !env.PASSWORD_PEPPER ||
    !env.LOGIN_RATE_LIMITER
  ) {
    return json({
      error: "Login temporariamente indisponível."
    }, 503);
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    "unknown";

  const rate = await env.LOGIN_RATE_LIMITER.limit({
    key: ip
  });

  if (!rate.success) {
    return json({
      error: "Muitas tentativas. Aguarde um minuto."
    }, 429);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      error: "Dados inválidos."
    }, 400);
  }

  const username = String(
    body?.username || ""
  ).trim().toLowerCase();

  const password = String(
    body?.password || ""
  );

  if (
    !/^[a-z0-9_.-]{3,40}$/.test(username) ||
    password.length < 12 ||
    password.length > 128
  ) {
    return json({
      error: "Usuário ou senha incorretos."
    }, 401);
  }

  const user = await env.DB.prepare(`
    SELECT
      id,
      username,
      password_hash,
      role,
      status
    FROM users
    WHERE lower(username) = ?
      AND role IN ('owner', 'admin')
    LIMIT 1
  `).bind(username).first();

  const dummyHash =
    "pbkdf2$100000$" +
    "0".repeat(64) +
    "$" +
    "0".repeat(64);

  const valid = await verifyPassword(
    password,
    user?.password_hash || dummyHash,
    env
  );

  if (
    !user ||
    !valid ||
    user.status !== "active"
  ) {
    return json({
      error: "Usuário ou senha incorretos."
    }, 401);
  }

  const session = randomHex(32);

  const sessionHash = await sha256(session);

  const expires = new Date(
    Date.now() + 86400000
  ).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO sessions (
        token_hash,
        user_id,
        expires_at
      )
      VALUES (?, ?, ?)
    `).bind(
      sessionHash,
      user.id,
      expires
    ),

    env.DB.prepare(`
      INSERT INTO audit_logs (
        id,
        user_id,
        action,
        details
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      user.id,
      "ADMIN_LOGIN",
      JSON.stringify({
        role: user.role
      })
    )
  ]);

  return Response.json({
    success: true,
    redirect: "/dashboard"
  }, {
    headers: {
      "Cache-Control": "no-store",

      "Set-Cookie":
        "zynox_session=" + session +
        "; Path=/" +
        "; HttpOnly" +
        "; Secure" +
        "; SameSite=Lax" +
        "; Max-Age=86400"
    }
  });
}
