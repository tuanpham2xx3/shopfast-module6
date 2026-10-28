import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { io } from "socket.io-client";
const base = "https://shopfast.tuanpq.com",
  checks = [];
await mkdir("harness/reports", { recursive: true });
const seed = dotenv.parse(await readFile(".secrets/deployment-seed.env"));
const tokens = {};
function sql(query) {
  const p = spawnSync(
    "ssh",
    [
      "-i",
      ".secrets/shopfast-ec2.pem",
      "ubuntu@3.27.169.177",
      "cd /opt/shopfast && sudo docker compose -f compose.infra.yml exec -T postgres psql -U shopfast -d shopfast -At",
    ],
    { input: query, encoding: "utf8" },
  );
  if (p.status) throw new Error("Fixture DB lookup failed");
  return p.stdout.trim();
}
async function request(
  path,
  { method = "GET", body, role, key, expected, attempt = 0 } = {},
) {
  const r = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(35000),
  });
  const json = await r.json();
  if (r.status === 429 && attempt < 2) {
    const wait = Math.min(
      120,
      Math.max(1, Number(r.headers.get("retry-after")) || 60),
    );
    console.log(`Rate limit respected; next attempt after ${wait}s`);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return request(path, {
      method,
      body,
      role,
      key,
      expected,
      attempt: attempt + 1,
    });
  }
  if (expected) assert.equal(r.status, expected, `${method} ${path}`);
  else if (!r.ok)
    throw new Error(
      `${method} ${path}: HTTP${r.status} ${json.error?.code ?? ""}`,
    );
  return { data: json.data, response: r };
}
async function poll(fn, timeout = 45000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for worker/provider");
}
let socket;
try {
  for (const role of ["warehouse", "support", "admin"]) {
    tokens[role] = (
      await request("/auth/login", {
        method: "POST",
        body: {
          email: `${role}@shopfast.test`,
          password: seed.DEV_SEED_PASSWORD,
        },
      })
    ).data.accessToken;
  }
  const id = randomUUID().replaceAll("-", "").slice(0, 12);
  const configured = process.env.EMAIL_TEST_TO;
  assert(
    configured && /^[^@]+@gmail\.com$/.test(configured),
    "Staging email fixture requires the configured Gmail test inbox",
  );
  const email = configured.replace("@", `+sf${id}@`),
    password = randomUUID() + "Aa!";
  const registration = await request("/auth/register", {
    method: "POST",
    body: { email, password, displayName: "Harness Demo" },
  });
  tokens.customer = registration.data.accessToken;
  assert(registration.response.headers.get("set-cookie").includes("Secure"));
  checks.push("AUTH-register-secure-cookie");
  const delivery = await poll(async () => {
    const row = sql(
      `SELECT json_build_object('code',e.payload->>'code','providerId',d.provider_id) FROM outbox_events e LEFT JOIN email_deliveries d ON d.business_key=e.business_key WHERE e.type='auth.email' AND e.payload->>'recipient'='${email}' ORDER BY e.created_at DESC LIMIT 1;`,
    );
    if (!row) return null;
    const data = JSON.parse(row);
    return data.providerId ? data : null;
  });
  const provider = await fetch(
    "https://api.resend.com/emails/" + delivery.providerId,
    { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } },
  );
  assert(provider.ok);
  const sent = await provider.json();
  assert(sent.html.includes(delivery.code));
  await request("/auth/verification/confirm", {
    method: "POST",
    role: "customer",
    body: { code: delivery.code },
  });
  checks.push("AUTH-worker-live-email-OTP-confirmation");
  const products = (await request("/products", { role: "customer" })).data;
  const product = products.items.find((p) => p.active !== false);
  assert(product);
  const key = "harness-" + id;
  const checkout = {
    items: [
      {
        productId: product.id,
        quantity: 1,
        expectedUnitPrice: Number(product.price),
      },
    ],
    shippingAddress: {
      recipientName: "Synthetic Demo",
      addressLine: "123 Fixture Street",
      phone: "0901234567",
      ward: "Fixture",
      province: "Demo",
    },
  };
  const order = (
    await request("/orders", {
      method: "POST",
      role: "customer",
      key,
      body: checkout,
    })
  ).data;
  assert.deepEqual(
    (
      await request("/orders", {
        method: "POST",
        role: "customer",
        key,
        body: checkout,
      })
    ).data,
    order,
  );
  checks.push("ORD-checkout-idempotency");
  socket = io(base + "/orders", {
    auth: { token: tokens.customer },
    transports: ["websocket"],
    timeout: 10000,
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  const subscribed = await socket
    .timeout(10000)
    .emitWithAck("order.subscribe", { orderId: order.id });
  assert(subscribed.ok);
  let current = (
    await request(`/orders/${order.id}/mock-payment`, {
      method: "POST",
      role: "customer",
      key: key + "-pay",
      body: { expectedVersion: order.version },
    })
  ).data;
  for (const targetStatus of ["PROCESSING", "SHIPPING", "DELIVERED"]) {
    const event = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Realtime event missing")),
        15000,
      );
      const listener = (e) => {
        if (e.orderId === order.id && e.status === targetStatus) {
          clearTimeout(timer);
          socket.off("order.status.updated", listener);
          resolve(e);
        }
      };
      socket.on("order.status.updated", listener);
    });
    void event.catch(() => undefined);
    current = (
      await request(`/staff/orders/${order.id}/status`, {
        method: "PATCH",
        role: "warehouse",
        key: key + "-" + targetStatus,
        body: { expectedVersion: current.version, targetStatus },
      })
    ).data;
    await event;
  }
  checks.push("ORD-delivery-and-private-socket-events");
  const invoice = await poll(async () => {
    const d = (
      await request(`/orders/${order.id}/invoice`, { role: "customer" })
    ).data;
    return d.downloadUrl ? d : null;
  });
  const pdf = await fetch(base + "/api/v1" + invoice.downloadUrl, {
    headers: { Authorization: `Bearer ${tokens.customer}` },
  });
  assert(pdf.ok);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  checks.push("JOB-worker-invoice-PDF");
  const ticket = (
    await request("/tickets", {
      method: "POST",
      role: "customer",
      body: {
        subject: "Harness order support",
        body: "Kiểm tra đơn giao thành công giúp tôi.",
      },
    })
  ).data;
  const claimed = (
    await request(`/staff/tickets/${ticket.id}/claim`, {
      method: "POST",
      role: "support",
      body: { expectedVersion: ticket.version },
    })
  ).data;
  assert(claimed.id === ticket.id);
  await request(`/staff/tickets/${ticket.id}/messages`, {
    method: "POST",
    role: "support",
    body: { body: "ShopFast đã tiếp nhận yêu cầu kiểm tra." },
  });
  checks.push("TKT-customer-support-claim-reply");
  const session = (
    await request(`/staff/tickets/${ticket.id}/ai-sessions`, {
      method: "POST",
      role: "support",
    })
  ).data;
  const clientMessageId = randomUUID();
  const message = `Tra cứu trạng thái đơn ${order.code} và tồn kho SKU ${product.sku} bằng cả hai tool. Trả JSON đúng hợp đồng với claims cho cả hai resource.`;
  const beforeAi = (
    await request(`/tickets/${ticket.id}`, { role: "customer" })
  ).data;
  const answer = (
    await request(`/staff/ai-sessions/${session.sessionId}/messages`, {
      method: "POST",
      role: "support",
      body: { message, clientMessageId },
    })
  ).data;
  assert.equal(answer.status, "OK", "Production Gemini turn must succeed");
  assert(
    answer.evidence.some(
      (e) =>
        e.tool === "get_order_status" &&
        e.resourceId === order.code &&
        e.resultSummary.status === "DELIVERED",
    ),
    "Production model must ground order status in DB",
  );
  assert(
    answer.evidence.some(
      (e) => e.tool === "check_inventory" && e.resourceId === product.sku,
    ),
    "Production model must call inventory tool",
  );
  const replay = (
    await request(`/staff/ai-sessions/${session.sessionId}/messages`, {
      method: "POST",
      role: "support",
      body: { message, clientMessageId },
    })
  ).data;
  assert.deepEqual(replay, answer);
  const afterAi = (await request(`/tickets/${ticket.id}`, { role: "customer" }))
    .data;
  assert.equal(afterAi.messages.total, beforeAi.messages.total);
  checks.push("AI-production-Gemini-two-tools-replay-no-auto-reply");
  await request("/admin/health", { role: "customer", expected: 403 });
  checks.push("RBAC-customer-denied-admin");
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.goto(base);
    await page.screenshot({
      path: "harness/reports/staging-mobile.png",
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    checks.push("UI-HTTPS-mobile-no-overflow");
  } finally {
    await browser.close();
  }
  console.log(`Staging: ${checks.length} end-to-end checks passed`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  socket?.disconnect();
  await mkdir("harness/reports", { recursive: true });
  await writeFile(
    "harness/reports/staging-live.json",
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        target: base,
        status: process.exitCode ? "FAIL" : "PASS",
        checks,
      },
      null,
      2,
    ) + "\n",
  );
}
