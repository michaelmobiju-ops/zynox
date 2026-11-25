import { webcrypto } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { paymentWebhook } from "../src/payment-webhook.js";

const originalFetch = globalThis.fetch;
const originalCrypto = globalThis.crypto;
const secret = "test-gateway-encryption-key-32chars";
async function encryptedToken(token) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(secret), "AES-GCM", false, ["encrypt"]);
  const cipher = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
  return hex(iv) + ":" + hex(cipher);
}
function request(body) {
  return new Request("https://zynox.test/webhooks/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": "sandbox-webhook-secret" },
    body: JSON.stringify(body)
  });
}
function paymentEnv({ amount = 25, reference = "zynox_order-1" } = {}) {
  const calls = { batch: 0, statements: [] };
  const env = {
    ASAAS_WEBHOOK_TOKEN: "sandbox-webhook-secret",
    GATEWAY_ENCRYPTION_KEY: secret,
    DB: {
      prepare(sql) {
        calls.statements.push(sql);
        return {
          bind(...args) {
            return {
              first: async () => sql.includes("SELECT pay.*") ? {
                id: "payment-1", external_id: "pay_test_1", gateway_id: "gateway-1",
                credentials_encrypted: env.encrypted, provider: "asaas_sandbox",
                order_id: "order-1", total_cents: 2500, amount_cents: 2500, store_id: "store-1"
              } : undefined,
              run: async () => ({ meta: { changes: 1 } })
            };
          }
        };
      },
      async batch(statements) { calls.batch++; calls.statements.push(...statements.map(s => s.sql)); }
    },
    calls
  };
  return { env, amount, reference };
}

test("rejects non-POST webhook requests", async () => {
  const response = await paymentWebhook(new Request("https://zynox.test/webhooks/payments"), { DB: { prepare() { throw Error("unexpected DB access"); } } });
  assert.equal(response.status, 405);
});
test("rejects malformed webhook JSON", async () => {
  const response = await paymentWebhook(new Request("https://zynox.test/webhooks/payments", { method: "POST", body: "{" }), { DB: { prepare() { throw Error("unexpected DB access"); } } });
  assert.equal(response.status, 400);
});
test("rejects unsigned payment webhook", async () => {
  const response = await paymentWebhook(new Request("https://zynox.test/webhooks/payments", { method: "POST", body: JSON.stringify({ data: { id: "p1" } }) }), { DB: { prepare() { throw Error("unexpected DB access"); } } });
  assert.equal(response.status, 401);
});
test("reconciles completed Asaas transfer webhook", async () => {
  let statement, values;
  const env = { ASAAS_WEBHOOK_TOKEN: "sandbox-webhook-secret", DB: { prepare(sql) { statement = sql; return { bind(...args) { values = args; return { run: async () => ({ meta: { changes: 1 } }) }; } }; } } };
  const response = await paymentWebhook(request({ transfer: { id: "tr_test_123", status: "DONE", externalReference: "zynox_withdrawal_w1" } }), env);
  assert.equal(response.status, 200); assert.match(statement, /UPDATE wallet_transactions SET status/);
  assert.equal(values[0], "completed"); assert.equal(values[2], "asaas_transfer:tr_test_123"); assert.equal(values[3], "withdrawal_request:w1");
});
test("marks failed Asaas transfer webhook as failed", async () => {
  let values;
  const env = { ASAAS_WEBHOOK_TOKEN: "sandbox-webhook-secret", DB: { prepare() { return { bind(...args) { values = args; return { run: async () => ({ meta: { changes: 1 } }) }; } }; } } };
  const response = await paymentWebhook(request({ transfer: { id: "tr_test_fail", status: "FAILED", failReason: "sandbox failure" } }), env);
  assert.equal(response.status, 200); assert.equal(values[0], "failed");
});
test("confirms sandbox Pix, credits wallet once, and skips delivery without Discord configuration", async () => {
  const { env } = paymentEnv();
  env.encrypted = await encryptedToken("sandbox-api-token");
  globalThis.fetch = async url => {
    assert.equal(String(url), "https://api-sandbox.asaas.com/v3/payments/pay_test_1");
    return Response.json({ status: "RECEIVED", value: 25, externalReference: "zynox_order-1" });
  };
  try {
    const response = await paymentWebhook(request({ payment: { id: "pay_test_1" } }), env);
    assert.equal(response.status, 200);
    assert.equal(env.calls.batch, 1);
    assert.ok(env.calls.statements.some(sql => sql.includes("INSERT OR IGNORE INTO wallet_transactions")));
  } finally { globalThis.fetch = originalFetch; }
});
test("does not credit wallet when provider amount or order reference mismatches", async () => {
  const { env } = paymentEnv();
  env.encrypted = await encryptedToken("sandbox-api-token");
  globalThis.fetch = async () => Response.json({ status: "RECEIVED", value: 24, externalReference: "zynox_order-1" });
  try {
    const response = await paymentWebhook(request({ payment: { id: "pay_test_1" } }), env);
    assert.equal(response.status, 409);
    assert.equal(env.calls.batch, 0);
  } finally { globalThis.fetch = originalFetch; }
});
