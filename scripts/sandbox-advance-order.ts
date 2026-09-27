// Moves a SANDBOX order's fulfillment to a new state — what a staff member
// tapping Ready / Complete on the register does — so the order-text webhook
// (/api/webhooks/square) can be tested without a Square device.
//
//   npm run sandbox:advance -- <orderId> PREPARED     # "ready" text
//   npm run sandbox:advance -- <orderId> COMPLETED    # "complete" text
//
// Reads the token from .env.sandbox. Refuses to run against production.
import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const line of readFileSync(".env.sandbox", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}
const TOKEN = env.SQUARE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("Paste the SANDBOX access token into .env.sandbox first.");
const BASE = "https://connect.squareupsandbox.com";

const [orderId, state] = process.argv.slice(2);
const STATES = ["RESERVED", "PREPARED", "COMPLETED", "CANCELED"];
if (!orderId || !STATES.includes(state)) {
  console.error(`usage: npm run sandbox:advance -- <orderId> <${STATES.join("|")}>`);
  process.exit(1);
}

async function sq<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Square-Version": "2025-01-23",
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

interface Order {
  id: string;
  location_id: string;
  version: number;
  state: string;
  fulfillments?: { uid: string; type: string; state: string }[];
}

(async () => {
  const { order } = await sq<{ order: Order }>(`/v2/orders/${orderId}`);
  const f = order.fulfillments?.[0];
  if (!f) throw new Error("Order has no fulfillment.");
  console.log(`${order.id} @ ${order.location_id}: ${f.type} ${f.state} -> ${state}`);
  const updated = await sq<{ order: Order }>(`/v2/orders/${orderId}`, {
    method: "PUT",
    body: JSON.stringify({
      idempotency_key: `advance-${Date.now()}`,
      order: { location_id: order.location_id, version: order.version, fulfillments: [{ uid: f.uid, state }] },
    }),
  });
  console.log(`now: fulfillment ${updated.order.fulfillments?.[0]?.state}, order ${updated.order.state}`);
})().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
