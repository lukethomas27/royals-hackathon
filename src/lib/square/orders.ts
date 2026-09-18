// Order creation. Per build doc section 5 / build-team rule 5: orders must
// be created against the *correct* Square location ID so revenue reports
// out of the selling concession — this is an accounting requirement, not a
// preference. We never compute totals ourselves for the order that gets
// submitted (Square's Orders API returns the authoritative total, tax,
// tips and fees) — tax.ts's estimateLineTax is cart-preview only.
//
// Fulfillment shape (checked 2026-09-18 against Square's "Manage Order
// Fulfillments" guide): PICKUP needs a recipient display name and either a
// pickup time or, with schedule_type ASAP, a prep_time_duration. DELIVERY
// additionally needs recipient phone + address. Square only surfaces an
// order on the register / Order Manager / kitchen printer once it is PAID —
// see payments.ts for the two ways this app pays an order.

import { isSquareConfigured, squareRequest } from "./client";
import { SquareCreateOrderRequest, SquareCreateOrderResult } from "./types";

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
    fulfillments?: { uid?: string; state?: string }[];
  };
  errors?: { code?: string; detail?: string }[];
}

const PICKUP_PREP = "PT10M";
const DELIVERY_PREP = "PT15M";

async function createLiveOrder(
  req: SquareCreateOrderRequest & { requiresIdCheckNote?: string }
): Promise<SquareCreateOrderResult> {
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

  const body = {
    idempotency_key: idempotencyKey(),
    order: {
      location_id: req.locationId,
      line_items: req.lineItems.map((li) => ({
        catalog_object_id: li.catalogObjectId,
        quantity: li.quantity,
        note: li.note,
      })),
      ...(req.fullDiscountName
        ? {
            discounts: [
              { uid: "promo", name: req.fullDiscountName, percentage: "100", scope: "ORDER" },
            ],
          }
        : {}),
      fulfillments: [fulfillment],
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

export async function createOrder(
  req: SquareCreateOrderRequest & { requiresIdCheckNote?: string }
): Promise<SquareCreateOrderResult> {
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
    await squareRequest<OrderResponse>(`/v2/orders/${order.orderId}`, {
      method: "PUT",
      body: JSON.stringify({
        idempotency_key: idempotencyKey("cancel"),
        order: {
          location_id: order.locationId,
          version: order.version,
          state: "CANCELED",
          ...(order.fulfillmentUid
            ? { fulfillments: [{ uid: order.fulfillmentUid, state: "CANCELED" }] }
            : {}),
        },
      }),
    });
    return true;
  } catch (err) {
    console.error("[square/orders] could not cancel order after failed payment", order.orderId, err);
    return false;
  }
}
