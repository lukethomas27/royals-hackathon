// Order creation and pricing. Per build doc section 5 / build-team rule 5:
// orders must be created against the *correct* Square location ID so revenue
// reports out of the selling concession — this is an accounting requirement,
// not a preference. We never compute totals ourselves: Square prices the cart
// shown at checkout (calculateOrder) and the order that is created
// (createOrder), from one shared payload builder so the two cannot drift.
//
// Fulfillment shape (checked 2026-09-18 against Square's "Manage Order
// Fulfillments" guide): PICKUP needs a recipient display name and either a
// pickup time or, with schedule_type ASAP, a prep_time_duration. DELIVERY
// additionally needs recipient phone + address. Square only surfaces an
// order on the register / Order Manager / kitchen printer once it is PAID —
// see payments.ts for the two ways this app pays an order.

import { isSquareConfigured, squareRequest, SquareApiError } from "./client";
import { SquareCreateOrderRequest, SquareCreateOrderResult, SquareOrderQuote } from "./types";

export function idempotencyKey(prefix = "order"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface OrderResponse {
  order?: {
    id: string;
    location_id: string;
    version?: number;
    state?: string;
    total_money?: { amount: number; currency: string };
    total_tax_money?: { amount: number; currency: string };
    total_discount_money?: { amount: number; currency: string };
    taxes?: { name?: string; percentage?: string; applied_money?: { amount: number } }[];
    fulfillments?: { uid?: string; state?: string; type?: string }[];
  };
  errors?: { code?: string; detail?: string }[];
}

const PICKUP_PREP = "PT10M";
const DELIVERY_PREP = "PT15M";

type OrderShape = SquareCreateOrderRequest & { requiresIdCheckNote?: string };

/**
 * The one order payload builder. The quote shown at checkout and the order
 * actually created MUST come from here — if they diverge, a fan is charged
 * something other than the total they agreed to.
 */
function buildOrderPayload(req: OrderShape) {
  const noteParts = [req.note, req.requiresIdCheckNote].filter(Boolean);
  const recipient = {
    display_name: req.recipientName,
    phone_number: req.customerPhone,
  };

  const fulfillment =
    req.fulfillmentType === "PICKUP"
      ? {
          type: "PICKUP",
          state: "PROPOSED",
          pickup_details: {
            recipient,
            schedule_type: "ASAP",
            prep_time_duration: PICKUP_PREP,
            ...(noteParts.length ? { note: noteParts.join(" | ") } : {}),
          },
        }
      : {
          type: "DELIVERY",
          state: "PROPOSED",
          delivery_details: {
            recipient: { ...recipient, ...(req.standAddress ? { address: req.standAddress } : {}) },
            schedule_type: "ASAP",
            prep_time_duration: DELIVERY_PREP,
            note: [
              req.seat ? `Seat: Sec ${req.seat.section} Row ${req.seat.row} Seat ${req.seat.seat}` : null,
              ...noteParts,
            ]
              .filter(Boolean)
              .join(" | "),
          },
        };

  return {
    location_id: req.locationId,
    line_items: req.lineItems.map((li) => ({
      catalog_object_id: li.catalogObjectId,
      quantity: li.quantity,
      note: li.note,
    })),
    ...(req.discount
      ? {
          discounts: [
            { uid: "promo", name: req.discount.name, percentage: req.discount.percentage, scope: "ORDER" },
          ],
        }
      : {}),
    fulfillments: [fulfillment],
    // Square does NOT apply catalog taxes to Orders-API orders by default: an
    // order built from catalog_object_ids alone comes back with tax 0 and an
    // empty taxes[], and the stand then collects no GST/PST/Liquor Tax at all.
    // auto_apply_taxes tells Square to apply each line item's own catalog
    // taxes, so tax still comes from Square and nothing here computes it.
    // Verified against /v2/orders/calculate, including with the 100% promo
    // discount (total stays $0.00). Never also send order.taxes — Square
    // would apply both sets and double-tax the fan.
    pricing_options: { auto_apply_taxes: true },
  };
}

function toQuote(data: OrderResponse): SquareOrderQuote {
  const order = data.order;
  const total = order?.total_money?.amount ?? 0;
  const tax = order?.total_tax_money?.amount ?? 0;
  const discount = order?.total_discount_money?.amount ?? 0;
  return {
    currency: order?.total_money?.currency ?? "CAD",
    subtotalCents: total - tax + discount,
    discountCents: discount,
    taxCents: tax,
    totalCents: total,
    taxLines: (order?.taxes ?? []).map((t) => ({
      name: t.name ?? "Tax",
      percentage: t.percentage ?? "",
      amountCents: t.applied_money?.amount ?? 0,
    })),
  };
}

/**
 * Prices a cart without creating anything. This is the ONLY source of the
 * totals shown to a fan — there is deliberately no local tax calculation to
 * fall back to, so a failure here must block the order.
 */
export async function calculateOrder(req: OrderShape): Promise<SquareOrderQuote> {
  const data = await squareRequest<OrderResponse>("/v2/orders/calculate", {
    method: "POST",
    body: JSON.stringify({ order: buildOrderPayload(req) }),
  });
  if (!data.order) {
    throw new Error(data.errors?.[0]?.detail ?? "Square returned no priced order");
  }
  return toQuote(data);
}

async function createLiveOrder(req: OrderShape): Promise<SquareCreateOrderResult> {
  const body = {
    idempotency_key: idempotencyKey(),
    order: {
      ...buildOrderPayload(req),
      metadata: { customer_phone: req.customerPhone },
    },
  };

  const data = await squareRequest<OrderResponse>("/v2/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!data.order) {
    throw new Error(data.errors?.[0]?.detail ?? "Square order creation failed with no order returned");
  }

  return {
    orderId: data.order.id,
    locationId: data.order.location_id,
    totalMoney: data.order.total_money ?? { amount: 0, currency: "CAD" },
    version: data.order.version ?? 1,
    fulfillmentUid: data.order.fulfillments?.[0]?.uid ?? null,
  };
}

export async function createOrder(req: OrderShape): Promise<SquareCreateOrderResult> {
  if (!isSquareConfigured()) {
    // Dev-mode stand-in so the checkout flow is demoable end to end.
    console.warn(
      "[square/orders] SQUARE_ACCESS_TOKEN not set — returning a mock order, nothing was sent to Square."
    );
    return {
      orderId: `MOCK-ORDER-${idempotencyKey()}`,
      locationId: req.locationId,
      totalMoney: { amount: 0, currency: "CAD" },
      version: 1,
      fulfillmentUid: null,
    };
  }
  return createLiveOrder(req);
}

/**
 * Best-effort cancel of an order whose payment failed, so an unpaid order
 * never lingers in Square. Never throws — the payment error is what the fan
 * needs to see, and an OPEN unpaid order is invisible to staff anyway.
 */
export async function cancelOrder(order: SquareCreateOrderResult): Promise<boolean> {
  if (!isSquareConfigured() || order.orderId.startsWith("MOCK-")) return true;
  try {
    // A failed payment attempt still attaches a (failed) tender and bumps
    // the order version, so re-read it rather than trusting the version we
    // got back from CreateOrder — a stale version is a 400 VERSION_MISMATCH.
    // Square also refuses `state: CANCELED` while any fulfillment is still
    // PROPOSED ("All fulfillments must have a state of COMPLETED, CANCELED,
    // or FAILED"), so: cancel the fulfillment first, then the order.
    const current = await squareRequest<OrderResponse>(`/v2/orders/${order.orderId}`);
    let version = current.order?.version ?? order.version;
    const fulfillment = current.order?.fulfillments?.[0];
    if (fulfillment?.uid && fulfillment.state !== "CANCELED" && fulfillment.state !== "COMPLETED") {
      const detailsKey = fulfillment.type === "DELIVERY" ? "delivery_details" : "pickup_details";
      const step1 = await squareRequest<OrderResponse>(`/v2/orders/${order.orderId}`, {
        method: "PUT",
        body: JSON.stringify({
          idempotency_key: idempotencyKey("cancel-f"),
          order: {
            location_id: order.locationId,
            version,
            fulfillments: [{ uid: fulfillment.uid, state: "CANCELED", [detailsKey]: { cancel_reason: "Payment failed" } }],
          },
        }),
      });
      version = step1.order?.version ?? version + 1;
    }
    await squareRequest<OrderResponse>(`/v2/orders/${order.orderId}`, {
      method: "PUT",
      body: JSON.stringify({
        idempotency_key: idempotencyKey("cancel"),
        order: { location_id: order.locationId, version, state: "CANCELED" },
      }),
    });
    return true;
  } catch (err) {
    const detail = err instanceof SquareApiError ? JSON.stringify(err.body) : String(err);
    console.error("[square/orders] could not cancel order after failed payment", order.orderId, detail);
    return false;
  }
}
