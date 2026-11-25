import { getSession } from "./auth.js";
import { hashPassword } from "./admin-auth.js";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function handleControl(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const user = await getSession(request, env);

  if (!user) {
    return json({
      error: "Autenticação necessária."
    }, 401);
  }

  if (!["owner", "admin"].includes(user.role)) {
    return json({
      error: "Acesso restrito."
    }, 403);
  }

  if (
    method !== "GET" &&
    request.headers.get("Origin") !== url.origin
  ) {
    return json({
      error: "Origem não autorizada."
    }, 403);
  }

  const isOwner = user.role === "owner";

  let body = {};

  if (method === "POST") {
    try {
      body = await request.json();
    } catch {
      return json({
        error: "Dados inválidos."
      }, 400);
    }
  }

  // ESTATÍSTICAS

  if (
    path === "/api/control/stats" &&
    method === "GET"
  ) {
    const results = await env.DB.batch([
      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE role = 'subscriber'
      `),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM subscriptions
        WHERE status = 'active'
        AND (
          lifetime = 1 OR
          datetime(expires_at) > datetime('now')
        )
      `),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE status = 'suspended'
      `),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM licenses
        WHERE status = 'available'
      `),

      env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE role = 'admin'
      `)
    ]);

    return json({
      subscribers: results[0].results[0].total,
      activeSubscriptions: results[1].results[0].total,
      suspended: results[2].results[0].total,
      availableLicenses: results[3].results[0].total,
      administrators: results[4].results[0].total
    });
  }

  // LISTAR ASSINANTES

  if (
    path === "/api/control/users" &&
    method === "GET"
  ) {
    const result = await env.DB.prepare(`
      SELECT
        u.id,
        u.username,
        u.discord_id,
        u.status,
        u.created_at,
        s.plan,
        s.expires_at,
        s.lifetime,
        s.status AS subscription_status
      FROM users u
      LEFT JOIN subscriptions s
        ON s.user_id = u.id
      WHERE u.role = 'subscriber'
      ORDER BY u.created_at DESC
      LIMIT 500
    `).all();

    return json({
      users: result.results
    });
  }

  // SUSPENDER OU REATIVAR ASSINANTE

  if (
    path === "/api/control/users/status" &&
    method === "POST"
  ) {
    const id = String(body.id || "");
    const status = String(body.status || "");

    if (!["active", "suspended"].includes(status)) {
      return json({
        error: "Status inválido."
      }, 400);
    }

    const target = await env.DB.prepare(`
      SELECT id
      FROM users
      WHERE id = ?
      AND role = 'subscriber'
    `).bind(id).first();

    if (!target) {
      return json({
        error: "Assinante não encontrado."
      }, 404);
    }

    const statements = [
      env.DB.prepare(`
        UPDATE users
        SET status = ?
        WHERE id = ?
        AND role = 'subscriber'
      `).bind(status, id),

      env.DB.prepare(`
        INSERT INTO audit_logs (
          id, user_id, action, details
        )
        VALUES (?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        user.id,
        "USER_STATUS_CHANGED",
        JSON.stringify({ id, status })
      )
    ];

    if (status === "suspended") {
      statements.push(
        env.DB.prepare(`
          DELETE FROM sessions
          WHERE user_id = ?
        `).bind(id)
      );
    }

    await env.DB.batch(statements);

    return json({ success: true });
  }

  // GERENCIAR ASSINATURA

  if (
    path === "/api/control/subscriptions/update" &&
    method === "POST"
  ) {
    const id = String(body.id || "");
    const plan = String(body.plan || "");
    const lifetime = body.lifetime === true;
    const days = Number(body.days);

    if (!["starter", "pro", "premium"].includes(plan)) {
      return json({
        error: "Plano inválido."
      }, 400);
    }

    if (
      !lifetime &&
      (!Number.isInteger(days) ||
      days < 1 || days > 36500)
    ) {
      return json({
        error: "Duração inválida."
      }, 400);
    }

    const target = await env.DB.prepare(`
      SELECT id
      FROM users
      WHERE id = ?
      AND role = 'subscriber'
    `).bind(id).first();

    if (!target) {
      return json({
        error: "Assinante não encontrado."
      }, 404);
    }

    const now = new Date();

    const expiration = lifetime
      ? null
      : new Date(
          now.getTime() + days * 86400000
        ).toISOString();

    await env.DB.batch([
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
        VALUES (?, ?, ?, 'active', ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          plan = excluded.plan,
          status = 'active',
          starts_at = excluded.starts_at,
          expires_at = excluded.expires_at,
          lifetime = excluded.lifetime
      `).bind(
        crypto.randomUUID(),
        id,
        plan,
        now.toISOString(),
        expiration,
        lifetime ? 1 : 0
      ),

      env.DB.prepare(`
        INSERT INTO audit_logs (
          id, user_id, action, details
        )
        VALUES (?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        user.id,
        "SUBSCRIPTION_UPDATED",
        JSON.stringify({
          id,
          plan,
          expiration,
          lifetime
        })
      )
    ]);

    return json({
      success: true,
      expiresAt: expiration,
      lifetime
    });
  }

  // CANCELAR ASSINATURA

  if (
    path === "/api/control/subscriptions/cancel" &&
    method === "POST"
  ) {
    const id = String(body.id || "");

    const result = await env.DB.batch([
      env.DB.prepare(`
        UPDATE subscriptions
        SET status = 'cancelled'
        WHERE user_id = ?
        AND EXISTS (
          SELECT 1 FROM users
          WHERE id = ?
          AND role = 'subscriber'
        )
      `).bind(id, id),

      env.DB.prepare(`
        INSERT INTO audit_logs (
          id, user_id, action, details
        )
        SELECT ?, ?, ?, ?
        WHERE changes() = 1
      `).bind(
        crypto.randomUUID(),
        user.id,
        "SUBSCRIPTION_CANCELLED",
        JSON.stringify({ id })
      )
    ]);

    if (!result[0].meta.changes) {
      return json({
        error: "Assinatura não encontrada."
      }, 404);
    }

    return json({ success: true });
  }

  // FUNÇÕES EXCLUSIVAS DO DONO

  if (!isOwner) {
    return json({
      error: "Acesso exclusivo do DONO."
    }, 403);
  }

  // LISTAR ADMINISTRADORES

  if (
    path === "/api/control/admins" &&
    method === "GET"
  ) {
    const result = await env.DB.prepare(`
      SELECT
        id,
        username,
        role,
        status,
        created_at
      FROM users
      WHERE role = 'admin'
      ORDER BY created_at DESC
      LIMIT 500
    `).all();

    return json({
      admins: result.results
    });
  }

  // CRIAR ADMINISTRADOR

  if (
    path === "/api/control/admins/create" &&
    method === "POST"
  ) {
    const username = String(
      body.username || ""
    ).trim().toLowerCase();

    const password = String(
      body.password || ""
    );

    if (
      !/^[a-z0-9_.-]{3,40}$/.test(username) ||
      password.length < 12 ||
      password.length > 128
    ) {
      return json({
        error: "Usuário ou senha inválidos."
      }, 400);
    }

    if (!env.PASSWORD_PEPPER) {
      return json({
        error: "Configuração indisponível."
      }, 503);
    }

    const passwordHash = await hashPassword(
      password,
      env
    );

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
        SELECT ?, ?, ?, 'admin', 'active'
        WHERE NOT EXISTS (
          SELECT 1 FROM users
          WHERE lower(username) = ?
          AND role IN ('owner', 'admin')
        )
      `).bind(
        id,
        username,
        passwordHash,
        username
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
        "ADMIN_CREATED",
        JSON.stringify({ id, username })
      )
    ]);

    if (!result[0].meta.changes) {
      return json({
        error: "Usuário já existente."
      }, 409);
    }

    return json({
      success: true,
      id,
      username
    }, 201);
  }

  // SUSPENDER OU REATIVAR ADMIN

  if (
    path === "/api/control/admins/status" &&
    method === "POST"
  ) {
    const id = String(body.id || "");
    const status = String(body.status || "");

    if (!["active", "suspended"].includes(status)) {
      return json({
        error: "Status inválido."
      }, 400);
    }

    const target = await env.DB.prepare(`
      SELECT id FROM users
      WHERE id = ?
      AND role = 'admin'
    `).bind(id).first();

    if (!target) {
      return json({
        error: "Administrador não encontrado."
      }, 404);
    }

    const statements = [
      env.DB.prepare(`
        UPDATE users
        SET status = ?
        WHERE id = ?
        AND role = 'admin'
      `).bind(status, id),

      env.DB.prepare(`
        INSERT INTO audit_logs (
          id, user_id, action, details
        )
        VALUES (?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        user.id,
        "ADMIN_STATUS_CHANGED",
        JSON.stringify({ id, status })
      )
    ];

    if (status === "suspended") {
      statements.push(
        env.DB.prepare(`
          DELETE FROM sessions
          WHERE user_id = ?
        `).bind(id)
      );
    }

    await env.DB.batch(statements);

    return json({ success: true });
  }

  // EXCLUIR CADASTRO DE ADMINISTRADOR (somente dono)
  if(path==="/api/control/admins/delete"&&method==="POST"){
    const id=String(body.id||"");
    const target=await env.DB.prepare("SELECT id,username FROM users WHERE id=? AND role='admin'").bind(id).first();
    if(!target)return json({error:"Administrador não encontrado."},404);
    const linked=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM stores WHERE owner_id=?) AS stores,(SELECT COUNT(*) FROM licenses WHERE created_by=? OR redeemed_by=?) AS licenses,(SELECT COUNT(*) FROM subscriptions WHERE user_id=?) AS subscriptions").bind(id,id,id,id).first();
    if(linked.stores||linked.licenses||linked.subscriptions)return json({error:"Este administrador possui dados vinculados. Suspenda a conta e transfira/remova os registros antes de excluir."},409);
    try{const support=await env.DB.prepare("SELECT id FROM support_requests WHERE user_id=? LIMIT 1").bind(id).first();if(support)return json({error:"Este administrador possui solicitações de suporte. Suspenda a conta para preservar o histórico."},409);}catch(error){if(!String(error).includes("support_requests"))throw error;}
    const result=await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id),
      env.DB.prepare("DELETE FROM notifications WHERE user_id=?").bind(id),
      env.DB.prepare("UPDATE audit_logs SET user_id=NULL WHERE user_id=?").bind(id),
      env.DB.prepare("DELETE FROM users WHERE id=? AND role='admin'").bind(id),
      env.DB.prepare("INSERT INTO audit_logs(id,user_id,action,details) VALUES(?,?,?,?)").bind(crypto.randomUUID(),user.id,"ADMIN_DELETED",JSON.stringify({id,username:target.username}))
    ]);
    if(!result[3].meta.changes)return json({error:"Administrador não encontrado."},404);
    return json({success:true});
  }

  // HISTÓRICO ADMINISTRATIVO

  if (
    path === "/api/control/logs" &&
    method === "GET"
  ) {
    const result = await env.DB.prepare(`
      SELECT
        a.id,
        a.action,
        a.details,
        a.created_at,
        u.username
      FROM audit_logs a
      LEFT JOIN users u
        ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 200
    `).all();

    return json({
      logs: result.results
    });
  }

  return json({
    error: "Rota não encontrada."
  }, 404);
}
