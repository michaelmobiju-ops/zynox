import { getSession } from "./auth.js";

const PLANS = ["starter", "pro", "premium"];

const UNITS = [
  "minutes",
  "hours",
  "days",
  "months",
  "years"
];

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function generateKey() {
  const bytes = crypto.getRandomValues(
    new Uint8Array(24)
  );

  const value = Array.from(
    bytes,
    byte => byte.toString(16).padStart(2, "0")
  ).join("").toUpperCase();

  return "ZYNOX-" +
    value.match(/.{1,8}/g).join("-");
}

async function hashKey(key) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      key.trim().toUpperCase()
    )
  );

  return Array.from(
    new Uint8Array(bytes),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

function calculateExpiration(duration, unit) {
  const date = new Date();

  switch (unit) {
    case "minutes":
      date.setUTCMinutes(
        date.getUTCMinutes() + duration
      );
      break;

    case "hours":
      date.setUTCHours(
        date.getUTCHours() + duration
      );
      break;

    case "days":
      date.setUTCDate(
        date.getUTCDate() + duration
      );
      break;

    case "months":
    case "years": {
      const day = date.getUTCDate();

      date.setUTCDate(1);

      date.setUTCMonth(
        date.getUTCMonth() +
        duration * (unit === "years" ? 12 : 1)
      );

      const lastDay = new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth() + 1,
          0
        )
      ).getUTCDate();

      date.setUTCDate(Math.min(day, lastDay));

      break;
    }

    default:
      throw new Error("Unidade inválida.");
  }

  return date.toISOString();
}

async function getBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleLicenses(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  const user = await getSession(request, env);

  if (!user) {
    return json({
      error: "Autenticação necessária."
    }, 401);
  }

  if (
    request.method !== "GET" &&
    request.headers.get("Origin") !== url.origin
  ) {
    return json({
      error: "Origem não autorizada."
    }, 403);
  }

  if (
    path.startsWith("/api/owner/") &&
    user.role !== "owner"
  ) {
    return json({
      error: "Acesso exclusivo do proprietário."
    }, 403);
  }

  if (
    path === "/api/owner/licenses/create" &&
    request.method === "POST"
  ) {
    return createLicenses(request, env, user);
  }

  if (
    path === "/api/owner/licenses/list" &&
    request.method === "GET"
  ) {
    return listLicenses(env);
  }

  if (
    path === "/api/owner/licenses/revoke" &&
    request.method === "POST"
  ) {
    return revokeLicense(request, env, user);
  }

  if (
    path === "/api/licenses/redeem" &&
    request.method === "POST"
  ) {
    return redeemLicense(request, env, user);
  }

  return json({
    error: "Rota não encontrada."
  }, 404);
}

async function createLicenses(request, env, user) {
  const body = await getBody(request);

  if (!body) {
    return json({
      error: "Dados inválidos."
    }, 400);
  }

  const plan = String(
    body.plan || ""
  ).toLowerCase();

  const lifetime = body.lifetime === true;

  const quantity = Number(body.quantity ?? 1);

  const duration = Number(body.duration);

  const unit = String(body.unit || "");

  if (!PLANS.includes(plan)) {
    return json({
      error: "Plano inválido."
    }, 400);
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 50
  ) {
    return json({
      error: "Quantidade permitida: 1 a 50."
    }, 400);
  }

  const limits = {
    minutes: 52560000,
    hours: 876000,
    days: 36500,
    months: 1200,
    years: 100
  };

  if (
    !lifetime &&
    (
      !Number.isInteger(duration) ||
      duration < 1 ||
      !UNITS.includes(unit) ||
      duration > limits[unit]
    )
  ) {
    return json({
      error: "Duração inválida."
    }, 400);
  }

  const keys = [];
  const statements = [];

  for (let i = 0; i < quantity; i++) {
    const key = generateKey();

    const id = crypto.randomUUID();

    const hash = await hashKey(key);

    statements.push(
      env.DB.prepare(`
        INSERT INTO licenses (
          id,
          key_hash,
          plan,
          duration,
          duration_unit,
          lifetime,
          status,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, 'available', ?)
      `).bind(
        id,
        hash,
        plan,
        lifetime ? null : duration,
        lifetime ? null : unit,
        lifetime ? 1 : 0,
        user.id
      )
    );

    keys.push({
      id,
      key,
      plan,
      duration: lifetime ? null : duration,
      unit: lifetime ? null : unit,
      lifetime
    });
  }

  statements.push(
    env.DB.prepare(`
      INSERT INTO audit_logs (
        id, user_id, action, details
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      user.id,
      "LICENSES_CREATED",
      JSON.stringify({
        quantity,
        plan,
        lifetime
      })
    )
  );

  await env.DB.batch(statements);

  return json({
    success: true,
    quantity,
    licenses: keys
  }, 201);
}

async function listLicenses(env) {
  const result = await env.DB.prepare(`
    SELECT
      licenses.id,
      licenses.plan,
      licenses.duration,
      licenses.duration_unit,
      licenses.lifetime,
      licenses.status,
      licenses.created_at,
      licenses.redeemed_at,
      users.username AS redeemed_username,
      users.discord_id AS redeemed_discord_id
    FROM licenses
    LEFT JOIN users
      ON users.id = licenses.redeemed_by
    ORDER BY licenses.created_at DESC
    LIMIT 500
  `).all();

  return json({
    success: true,
    licenses: result.results
  });
}

async function redeemLicense(request, env, user) {
  if (
    user.role !== "subscriber" ||
    !user.discord_id
  ) {
    return json({
      error: "Utilize uma conta de assinante vinculada ao Discord."
    }, 403);
  }

  const body = await getBody(request);

  const key = String(
    body?.key || ""
  ).trim().toUpperCase();

  if (
    !/^ZYNOX-(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/.test(key)
  ) {
    return json({
      error: "Chave inválida."
    }, 400);
  }

  const hash = await hashKey(key);

  const license = await env.DB.prepare(`
    SELECT *
    FROM licenses
    WHERE key_hash = ?
      AND status = 'available'
  `).bind(hash).first();

  if (!license) {
    return json({
      error: "Chave inválida, utilizada ou revogada."
    }, 400);
  }

  const lifetime = license.lifetime === 1;

  const expiration = lifetime
    ? null
    : calculateExpiration(
        license.duration,
        license.duration_unit
      );

  const now = new Date().toISOString();

  const redemptionId = crypto.randomUUID();

  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE licenses
      SET
        status = 'redeemed',
        redeemed_by = ?,
        redeemed_at = ?
      WHERE id = ?
        AND status = 'available'
        AND NOT EXISTS (
          SELECT 1
          FROM subscriptions
          WHERE user_id = ?
            AND status = 'active'
            AND (
              lifetime = 1
              OR datetime(expires_at) >
                 datetime('now')
            )
        )
    `).bind(
      user.id,
      now,
      license.id,
      user.id
    ),

    env.DB.prepare(`
      INSERT INTO subscriptions (
        id,
        user_id,
        plan,
        status,
        starts_at,
        expires_at,
        lifetime
      )
      SELECT
        ?, ?, ?, 'active', ?, ?, ?
      WHERE changes() = 1
      ON CONFLICT(user_id)
      DO UPDATE SET
        id = excluded.id,
        plan = excluded.plan,
        status = 'active',
        starts_at = excluded.starts_at,
        expires_at = excluded.expires_at,
        lifetime = excluded.lifetime
    `).bind(
      redemptionId,
      user.id,
      license.plan,
      now,
      expiration,
      lifetime ? 1 : 0
    ),

    env.DB.prepare(`
      INSERT INTO audit_logs (
        id, user_id, action, details
      )
      SELECT ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      crypto.randomUUID(),
      user.id,
      "LICENSE_REDEEMED",
      JSON.stringify({
        licenseId: license.id,
        subscriptionId: redemptionId
      })
    )
  ]);

  if (result[0].meta.changes !== 1) {
    return json({
      error: "Licença indisponível ou assinatura já ativa."
    }, 409);
  }

  return json({
    success: true,
    message: "Licença ativada com sucesso!",
    plan: license.plan,
    expires_at: expiration,
    lifetime
  });
}

async function revokeLicense(request, env, user) {
  const body = await getBody(request);

  const id = String(body?.id || "");

  if (!id || id.length > 64) {
    return json({
      error: "Licença inválida."
    }, 400);
  }

  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE subscriptions
      SET status = 'revoked'
      WHERE id IN (
        SELECT json_extract(
          details,
          '$.subscriptionId'
        )
        FROM audit_logs
        WHERE action = 'LICENSE_REDEEMED'
          AND json_extract(
            details,
            '$.licenseId'
          ) = ?
      )
      AND status = 'active'
    `).bind(id),

    env.DB.prepare(`
      UPDATE licenses
      SET status = 'revoked'
      WHERE id = ?
        AND status IN ('available', 'redeemed')
    `).bind(id),

    env.DB.prepare(`
      INSERT INTO audit_logs (
        id, user_id, action, details
      )
      SELECT ?, ?, ?, ?
      WHERE changes() = 1
    `).bind(
      crypto.randomUUID(),
      user.id,
      "LICENSE_REVOKED",
      JSON.stringify({ licenseId: id })
    )
  ]);

  if (result[1].meta.changes !== 1) {
    return json({
      error: "Licença inexistente ou já revogada."
    }, 404);
  }

  return json({
    success: true,
    message: "Licença revogada com sucesso."
  });
}
