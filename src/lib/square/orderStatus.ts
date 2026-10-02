// Live order status for the fan's open tracker (replaces the SMS that was
// never built — no messaging subscription, so the open page is the alert).
//
// The stage is read straight from the order's fulfillment state, which staff
// advance in Square (POS Orders tab / Order Manager / KDS):
//   PROPOSED  -> received   (paid, at the stand, nobody has touched it yet)
//   RESERVED  -> preparing  ("Mark in progress")
//   PREPARED  -> ready      ("Mark ready")
//   COMPLETED -> completed  ("Complete" / picked up / delivered)
//   CANCELED / FAILED, or the order itself CANCELED -> canceled
// If staff never advance it, the fan's screen honestly stays on "received".
//
// SCOPE: an order is only reported if it belongs to one of the four configured
// launch stands. The token reaches 62 locations; an order ID from any other
// location reads as not found. Only the stage is returned — never the name,
// phone or seat stored on the order.

import { isSquareConfigured, squareRequest } from "./client";
import { getConfiguredStandSlots } from "./config";
import { MAX_STATUS_IDS, OrderStage, OrderStatus } from "../orderStage";

// Square order IDs are URL-safe base62-ish strings; mock IDs add hyphens.
const ORDER_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export function isPlausibleOrderId(id: string): boolean {
  return ORDER_ID_RE.test(id);
}

export function stageFromSquare(orderState?: string, fulfillmentState?: string): OrderStage {
  if (orderState === "CANCELED") return "canceled";
  switch (fulfillmentState) {
    case "CANCELED":
    case "FAILED":
      return "canceled";
    case "COMPLETED":
      return "completed";
    case "PREPARED":
      return "ready";
    case "RESERVED":
      return "preparing";
    default:
      // An order closed without its fulfillment being touched still means the
      // fan has their food.
      return orderState === "COMPLETED" ? "completed" : "received";
  }
}

interface BatchRetrieveResponse {
  orders?: {
    id: string;
    location_id: string;
    state?: string;
    updated_at?: string;
    fulfillments?: { state?: string }[];
  }[];
}

// Mock mode: createOrder() stamps Date.now() into the ID, so a demo order
// walks through every stage on a clock without Square.
const MOCK_STAGE_AT_SECONDS: [number, OrderStage][] = [
  [90, "completed"],
  [45, "ready"],
  [15, "preparing"],
];

function mockStatus(orderId: string, now = Date.now()): OrderStatus | null {
  const placedAt = Number(orderId.match(/-(\d{13})-/)?.[1]);
  if (!orderId.startsWith("MOCK-") || !placedAt) return null;
  const elapsed = (now - placedAt) / 1000;
  const stage = MOCK_STAGE_AT_SECONDS.find(([after]) => elapsed >= after)?.[1] ?? "received";
  return { orderId, stage, updatedAt: null };
}

/**
 * Current stage for each requested order. IDs that are unknown, malformed or
 * belong to a location outside the four launch stands are simply absent.
 */
export async function getOrderStatuses(orderIds: string[]): Promise<OrderStatus[]> {
  const ids = [...new Set(orderIds.filter(isPlausibleOrderId))].slice(0, MAX_STATUS_IDS);
  if (ids.length === 0) return [];

  if (!isSquareConfigured()) {
    return ids.map((id) => mockStatus(id)).filter((s): s is OrderStatus => s !== null);
  }

  const liveIds = ids.filter((id) => !id.startsWith("MOCK-"));
  if (liveIds.length === 0) return [];
  const allowed = new Set(getConfiguredStandSlots().map((s) => s.locationId));
  const data = await squareRequest<BatchRetrieveResponse>("/v2/orders/batch-retrieve", {
    method: "POST",
    body: JSON.stringify({ order_ids: liveIds }),
  });

  return (data.orders ?? [])
    .filter((o) => allowed.has(o.location_id))
    .map((o) => ({
      orderId: o.id,
      stage: stageFromSquare(o.state, o.fulfillments?.[0]?.state),
      updatedAt: o.updated_at ?? null,
    }));
}
