import {
  hashPassword,
  verifyPassword
} from "./admin-auth.js";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function setupOwner(request, env) {
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
    !env.OWNER_USERNAME ||
    !env.OWNER_PASSWORD ||
    !env.PASSWORD_PEPPER ||
    !env.LOGIN_RATE_LIMITER
  ) {
    return json({
      error: "Configuração indisponível."
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
      error: "Muitas tentativas."
    }, 429);
  }

  const existing = await env.DB.prepare(`
    SELECT id
    FROM users
    WHERE role = 'owner'
    LIMIT 1
  `).first();

  if (existing) {
    return json({
      error: "A configuração inicial já foi concluída."
    }, 409);
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

  const ownerUsername =
    env.OWNER_USERNAME.trim().toLowerCase();

  if (
    !/^[a-z0-9_.-]{3,40}$/.test(username) ||
    password.length < 12 ||
    password.length > 128
  ) {
    return json({
      error: "Credenciais inválidas."
    }, 401);
  }

  const expectedHash = await hashPassword(
    env.OWNER_PASSWORD,
    env
  );

  const validPassword = await verifyPassword(
    password,
    expectedHash,
    env
  );

  if (
    username !== ownerUsername ||
    !validPassword
  ) {
    return json({
      error: "Credenciais inválidas."
    }, 401);
  }

  const id = crypto.randomUUID();

  const result = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (
        id,
        username,
        password_hash,
        role,
        status
      )
      SELECT
        ?, ?, ?, 'owner', 'active'
      WHERE NOT EXISTS (
        SELECT 1
        FROM users
        WHERE role = 'owner'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM users
        WHERE lower(username) = ?
          AND role IN ('owner', 'admin')
      )
    `).bind(
      id,
      username,
      expectedHash,
      username
    ),

    env.DB.prepare(`
      INSERT INTO audit_logs (
        id,
        user_id,
        action,
        details
      )
      SELECT ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      crypto.randomUUID(),
      id,
      "OWNER_CREATED",
      JSON.stringify({
        role: "owner"
      })
    )
  ]);

  if (result[0].meta.changes !== 1) {
    return json({
      error: "Não foi possível criar a conta."
    }, 409);
  }

  return json({
    success: true,
    message: "Conta de DONO criada com sucesso.",
    redirect: "/"
  }, 201);
}
