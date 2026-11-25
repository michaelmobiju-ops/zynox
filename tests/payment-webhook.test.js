import test from "node:test";
import assert from "node:assert/strict";
import { paymentWebhook } from "../src/payment-webhook.js";

function noDatabase() {
  return { prepare() { throw new Error("Database must not be reached"); } };
}

test("rejects non-POST webhook requests", async () => {
  const response = await paymentWebhook(new Request("https://zynox.test/webhooks/payments"), { DB: noDatabase() });
  assert.equal(response.status, 405);
});

test("rejects malformed webhook JSON", async () => {
  const response = await paymentWebhook(new Request("https://zynox.test/webhooks/payments", {
    method: "POST", body: "{"
  }), { DB: noDatabase() });
  assert.equal(response.status, 400);
});

test("rejects unsigned payment webhook", async () => {
  const response = await paymentWebhook(new Request("https://zynox.test/webhooks/payments", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { id: "payment-test" } })
  }), { DB: noDatabase() });
  assert.equal(response.status, 401);
});

test("reconciles completed Asaas transfer webhook", async () => {
  let statement, values;
  const env = {
    ASAAS_WEBHOOK_TOKEN: "sandbox-webhook-secret",
    DB: {
      prepare(sql) {
        statement = sql;
        return { bind(...args) { values = args; return { run: async () => ({ meta: { changes: 1 } }) }; } };
      }
    }
  };
  const response = await paymentWebhook(new Request("https://zynox.test/webhooks/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": "sandbox-webhook-secret" },
    body: JSON.stringify({ transfer: { id: "tr_test_123", status: "DONE", externalReference: "zynox_withdrawal_w1" } })
  }), env);
  assert.equal(response.status, 200);
  assert.match(statement, /UPDATE wallet_transactions SET status/);
  assert.equal(values[0], "completed");
  assert.equal(values[2], "asaas_transfer:tr_test_123");
  assert.equal(values[3], "withdrawal_request:w1");
});

test("marks failed Asaas transfer webhook as failed", async () => {
  let values;
  const env = {
    ASAAS_WEBHOOK_TOKEN: "sandbox-webhook-secret",
    DB: { prepare() { return { bind(...args) { values = args; return { run: async () => ({ meta: { changes: 1 } }) }; } }; } }
  };
  const response = await paymentWebhook(new Request("https://zynox.test/webhooks/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": "sandbox-webhook-secret" },
    body: JSON.stringify({ transfer: { id: "tr_test_fail", status: "FAILED", failReason: "sandbox failure" } })
  }), env);
  assert.equal(response.status, 200);
  assert.equal(values[0], "failed");
});
