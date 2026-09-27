// Fan-facing order texts: received → ready → complete (plus cancelled).
//
// "placed" is sent by /api/orders itself, right after the order is paid —
// we don't need Square to tell us about an order we just created. "ready"
// and "complete" come from Square: staff tap Ready / Complete on the
// register, Order Manager or KDS, Square moves the order's fulfillment to
// PREPARED / COMPLETED, and fires an `order.fulfillment.updated` webhook at
// /api/webhooks/square, which re-reads the order and calls in here.
//
// Every (order, stage) pair is claimed in Redis before sending, so Square's
// at-least-once webhook delivery (retries, duplicates, out-of-order events)
// never double-texts a fan.

import { getRedis } from "@/lib/redis";
import { sendSms } from "./sms";

export type OrderStage = "placed" | "ready" | "complete" | "canceled";

/** Keys this app writes into Square order `metadata` (see orders.ts). */
export const ORDER_METADATA = {
  /** Present on every order this app creates. */
  source: "arenapulse",
  /** "1" when the fan ticked the SMS opt-in. No key = never text. */
  smsOptIn: "arenapulse_sms",
  /** "1" when the order contains alcohol (reminds the fan to bring ID). */
  idCheck: "arenapulse_id_check",
  customerPhone: "customer_phone",
} as const;

export interface OrderSmsContext {
  orderId: string;
  phone: string;
  standName: string;
  fulfillmentType: "PICKUP" | "DELIVERY";
  /** Name the fan typed at checkout, if any (never the "Fan ····1234" fallback). */
  pickupName: string | null;
  seat?: { section: string; row: string; seat: string } | null;
  idCheck: boolean;
}

const PREFIX = "Victoria Royals:";

// Plain ASCII only: a single non-GSM character (·, ’, emoji) switches the
// whole text to UCS-2 and halves the per-segment length.
export function messageFor(stage: OrderStage, ctx: OrderSmsContext): string {
  const delivery = ctx.fulfillmentType === "DELIVERY";
  switch (stage) {
    case "placed":
      return delivery
        ? `${PREFIX} Order received at ${ctx.standName}${ctx.seat ? ` for Sec ${ctx.seat.section} Row ${ctx.seat.row} Seat ${ctx.seat.seat}` : ""}. We'll text you when it's on the way. Reply STOP to opt out.`
        : `${PREFIX} Order received at ${ctx.standName}${ctx.pickupName ? ` for ${ctx.pickupName}` : ""}. We'll text you when it's ready for pickup. Reply STOP to opt out.`;
    case "ready":
      return delivery
        ? `${PREFIX} Your order from ${ctx.standName} is on its way to your seat.${ctx.idCheck ? " Have your ID ready." : ""}`
        : `${PREFIX} Your order is ready! Pick it up at ${ctx.standName}${ctx.pickupName ? ` under ${ctx.pickupName}` : ""}.${ctx.idCheck ? " Bring your ID." : ""}`;
    case "complete":
      return `${PREFIX} Your order has been ${delivery ? "delivered" : "picked up"}. Enjoy the game!`;
    case "canceled":
      return `${PREFIX} Your order at ${ctx.standName} was cancelled. Please see the stand if you have any questions.`;
  }
}

// --- de-duplication ---

const CLAIM_PREFIX = "arenapulse:sms:";
const CLAIM_TTL_SECONDS = 7 * 24 * 60 * 60;
// Dev-only fallback (no Redis). Per-process, which is fine for `npm run dev`;
// production always has Redis (staffState.ts refuses to run without it).
const memoryClaims = new Set<string>();

function claimKey(orderId: string, stage: OrderStage) {
  return `${CLAIM_PREFIX}${orderId}:${stage}`;
}

/** True if this call won the right to send; false if already claimed. */
async function claim(orderId: string, stage: OrderStage): Promise<boolean> {
  const key = claimKey(orderId, stage);
  const redis = getRedis();
  if (redis) return (await redis.set(key, "1", { nx: true, ex: CLAIM_TTL_SECONDS })) === "OK";
  if (memoryClaims.has(key)) return false;
  memoryClaims.add(key);
  return true;
}

async function release(orderId: string, stage: OrderStage): Promise<void> {
  const key = claimKey(orderId, stage);
  const redis = getRedis();
  if (redis) await redis.del(key);
  else memoryClaims.delete(key);
}

async function isClaimed(orderId: string, stage: OrderStage): Promise<boolean> {
  const key = claimKey(orderId, stage);
  const redis = getRedis();
  if (redis) return (await redis.exists(key)) === 1;
  return memoryClaims.has(key);
}

export type NotifyOutcome =
  | { status: "sent" | "duplicate" | "skipped" }
  | { status: "failed"; retryable: boolean; detail: string };

export async function notifyOrderStage(stage: OrderStage, ctx: OrderSmsContext): Promise<NotifyOutcome> {
  // "placed" is only ever claimed after a successful payment, so it doubles
  // as "this order was really paid". Without it, a CANCELED event is our own
  // cleanup of a declined card (orders.ts cancelOrder) — the fan already saw
  // that error on screen, don't text them about it.
  if (stage === "canceled" && !(await isClaimed(ctx.orderId, "placed"))) {
    return { status: "skipped" };
  }
  if (!(await claim(ctx.orderId, stage))) return { status: "duplicate" };

  const result = await sendSms(ctx.phone, messageFor(stage, ctx));
  if (result.sent) return { status: "sent" };

  if (result.reason === "provider_error") {
    console.error(`[notify] ${stage} text for ${ctx.orderId} failed: ${result.detail}`);
    // Let a later webhook delivery try again, but only if it has a chance of
    // working. "placed" has no redelivery, and its claim must survive as the
    // "was paid" marker the cancel check above relies on.
    if (result.retryable && stage !== "placed") await release(ctx.orderId, stage);
    return { status: "failed", retryable: result.retryable, detail: result.detail };
  }
  // not_configured / invalid_number: keep the claim, nothing to retry.
  return { status: "skipped" };
}

// --- reading a Square order back ---

/** The subset of a RetrieveOrder response this module reads. */
export interface SquareOrderForNotify {
  id: string;
  location_id: string;
  state?: string;
  metadata?: Record<string, string>;
  fulfillments?: {
    type?: string;
    state?: string;
    pickup_details?: { recipient?: { display_name?: string; phone_number?: string } };
    delivery_details?: { recipient?: { display_name?: string; phone_number?: string } };
  }[];
}

/** Which text (if any) the order's current state calls for. */
export function stageForOrder(order: SquareOrderForNotify): OrderStage | null {
  const f = order.fulfillments?.[0];
  if (order.state === "CANCELED" || f?.state === "CANCELED" || f?.state === "FAILED") return "canceled";
  if (order.state === "COMPLETED" || f?.state === "COMPLETED") return "complete";
  if (f?.state === "PREPARED") return "ready";
  return null; // PROPOSED / RESERVED: nothing to tell the fan yet
}

// The "Fan ····1234" display name /api/orders uses when no name was typed.
const FALLBACK_NAME_RE = /^Fan ·+\d{4}$/;

/**
 * Null unless this is an order our app created AND the fan opted in to
 * texts. Webhooks fire for every order on Eventium's account, including
 * Square Online QR orders that Square already texts about — those carry no
 * `arenapulse` metadata and are ignored.
 */
export function contextFromSquareOrder(order: SquareOrderForNotify, standName: string): OrderSmsContext | null {
  const meta = order.metadata ?? {};
  if (meta[ORDER_METADATA.source] !== "1" || meta[ORDER_METADATA.smsOptIn] !== "1") return null;
  const f = order.fulfillments?.[0];
  const recipient = f?.pickup_details?.recipient ?? f?.delivery_details?.recipient;
  const phone = meta[ORDER_METADATA.customerPhone] ?? recipient?.phone_number;
  if (!phone) return null;
  const displayName = recipient?.display_name?.trim() ?? "";
  return {
    orderId: order.id,
    phone,
    standName,
    fulfillmentType: f?.type === "DELIVERY" ? "DELIVERY" : "PICKUP",
    pickupName: displayName && !FALLBACK_NAME_RE.test(displayName) ? displayName : null,
    seat: null,
    idCheck: meta[ORDER_METADATA.idCheck] === "1",
  };
}
