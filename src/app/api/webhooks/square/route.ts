import { NextRequest, NextResponse } from "next/server";
import { isSquareConfigured, squareRequest } from "@/lib/square/client";
import { getConfiguredStandSlots } from "@/lib/square/config";
import { getStandByLocationId } from "@/lib/square/locations";
import {
  getWebhookConfig,
  isValidSquareSignature,
  SQUARE_SIGNATURE_HEADER,
  SquareOrderWebhookEvent,
} from "@/lib/square/webhooks";
import {
  contextFromSquareOrder,
  notifyOrderStage,
  SquareOrderForNotify,
  stageForOrder,
} from "@/lib/notify/orderUpdates";
import { isProductionRuntime } from "@/lib/redis";

export const dynamic = "force-dynamic";

// Subscribe to `order.fulfillment.updated` in the Square Developer console
// (Webhooks → Subscriptions). `order.updated` is accepted too, as a
// fallback: either way we re-read the order and act on its current state,
// so event order and duplicates don't matter.
const HANDLED_EVENTS = new Set(["order.fulfillment.updated", "order.updated"]);

/**
 * POST — Square webhook receiver. Texts the fan when staff mark their order
 * ready / complete (or cancel it). Always answers 2xx unless a retry could
 * help — Square retries non-2xx responses, and a bad-signature 401 is the
 * only other deliberate failure.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const config = getWebhookConfig();
  if (config) {
    const ok = isValidSquareSignature({
      rawBody,
      signature: req.headers.get(SQUARE_SIGNATURE_HEADER),
      signatureKey: config.signatureKey,
      notificationUrl: config.notificationUrl ?? req.nextUrl.href,
    });
    if (!ok) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  } else if (isProductionRuntime()) {
    // Never act on unsigned requests from the public internet.
    console.error("[webhooks/square] SQUARE_WEBHOOK_SIGNATURE_KEY is not set — refusing webhook.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  } else {
    console.warn("[webhooks/square] no signature key set — accepting unsigned event (dev only).");
  }

  let event: SquareOrderWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }
  if (!event.type || !HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ ignored: "event type" });
  }

  const inner = event.data?.object?.order_fulfillment_updated ?? event.data?.object?.order_updated;
  const orderId = inner?.order_id ?? event.data?.id;
  const locationId = inner?.location_id;
  if (!orderId) return NextResponse.json({ ignored: "no order id" });

  // The webhook fires for every order across Eventium's whole account (60+
  // locations). Drop anything outside the four launch stands before making
  // a Square call.
  if (!locationId || !getConfiguredStandSlots().some((s) => s.locationId === locationId)) {
    return NextResponse.json({ ignored: "location" });
  }
  if (!isSquareConfigured()) return NextResponse.json({ ignored: "square not configured" });

  let order: SquareOrderForNotify | undefined;
  try {
    order = (await squareRequest<{ order?: SquareOrderForNotify }>(`/v2/orders/${orderId}`)).order;
  } catch (err) {
    console.error("[webhooks/square] could not read order", orderId, err);
    return NextResponse.json({ error: "Could not read order." }, { status: 502 }); // Square will retry
  }
  if (!order) return NextResponse.json({ ignored: "order not found" });

  const stage = stageForOrder(order);
  if (!stage) return NextResponse.json({ ignored: "no fan-facing change" });

  const stand = await getStandByLocationId(order.location_id).catch(() => null);
  const ctx = contextFromSquareOrder(order, stand?.displayName ?? "the stand");
  if (!ctx) return NextResponse.json({ ignored: "not an opted-in app order" });

  const outcome = await notifyOrderStage(stage, ctx);
  if (outcome.status === "failed" && outcome.retryable) {
    return NextResponse.json({ error: "SMS provider unavailable." }, { status: 503 }); // Square will retry
  }
  return NextResponse.json({ stage, outcome: outcome.status });
}
