// Order creation. Per build doc section 5 / build-team rule 5: orders must
// be created against the *correct* Square location ID so revenue reports
// out of the selling concession — this is an accounting requirement, not a
// preference. We never compute totals ourselves for the order that gets
// submitted (Square's Orders API returns the authoritative total, tax,
// tips and fees) — tax.ts's estimateLineTax is cart-preview only.
//
// Payment capture (Square Web Payments SDK, card entry, nonce -> Payments
// API) is NOT implemented here — that needs a live sandbox application ID
// and a browser-side SDK script, which needs real credentials to test
// against. See STATUS.md. This module covers order creation only.

import { isSquareConfigured, squareRequest } from "./client";
import { SquareCreateOrderRequest, SquareCreateOrderResult } from "./types";

function idempotencyKey(): string {
  return `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface CreateOrderResponse {
  order?: {
    id: string;
    location_id: string;
    total_money?: { amount: number; currency: string };
  };
  errors?: { detail?: string }[];
}

async function createLiveOrder(
  req: SquareCreateOrderRequest & { requiresIdCheckNote?: string }
): Promise<SquareCreateOrderResult> {
  const noteParts = [req.note, req.requiresIdCheckNote].filter(Boolean);

  const body = {
    idempotency_key: idempotencyKey(),
    order: {
      location_id: req.locationId,
      line_items: req.lineItems.map((li) => ({
        catalog_object_id: li.catalogObjectId,
        quantity: li.quantity,
        note: li.note,
      })),
      fulfillments: [
        {
          type: req.fulfillmentType,
          state: "PROPOSED",
          ...(req.fulfillmentType === "PICKUP"
            ? { pickup_details: { note: noteParts.join(" | ") } }
            : {
                delivery_details: {
                  note: [
                    noteParts.join(" | "),
                    req.seat ? `Seat: Sec ${req.seat.section} Row ${req.seat.row} Seat ${req.seat.seat}` : null,
                  ]
                    .filter(Boolean)
                    .join(" | "),
                },
              }),
        },
      ],
      metadata: { customer_phone: req.customerPhone },
    },
  };

  const data = await squareRequest<CreateOrderResponse>("/v2/orders", {
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
  };
}

export async function createOrder(
  req: SquareCreateOrderRequest & { requiresIdCheckNote?: string }
): Promise<SquareCreateOrderResult> {
  if (!isSquareConfigured()) {
    // Dev-mode stand-in so the checkout flow is demoable end to end.
    // eslint-disable-next-line no-console
    console.warn(
      "[square/orders] SQUARE_ACCESS_TOKEN not set — returning a mock order, nothing was sent to Square."
    );
    return {
      orderId: `MOCK-ORDER-${idempotencyKey()}`,
      locationId: req.locationId,
      totalMoney: { amount: 0, currency: "CAD" },
    };
  }
  return createLiveOrder(req);
}
