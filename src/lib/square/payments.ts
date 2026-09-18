// Payment capture (Square Payments API), added 2026-09-18.
//
// Two ways an order gets paid here:
//   1. Card: the browser tokenizes the card with the Web Payments SDK
//      (the server never sees a card number) and sends the one-time token
//      as `sourceId`; we call CreatePayment against the ORDER's own
//      total_money — never an amount the client supplied — with order_id +
//      location_id so Square links the payment to the order and the order
//      lands on the stand's register / Order Manager.
//   2. Zero-total order (100% promo): Square lets an order whose total is 0
//      be marked paid with PayOrder and an empty payment_ids list
//      (https://developer.squareup.com/reference/square/orders-api/pay-order).
//      No money moves, but the order is "paid" and prints like any other.

import { isSquareConfigured, squareRequest, SquareApiError } from "./client";
import { idempotencyKey } from "./orders";
import { SquareMoney, SquarePaymentResult } from "./types";

interface CreatePaymentResponse {
  payment?: {
    id: string;
    status?: string;
    amount_money?: SquareMoney;
    receipt_url?: string;
    order_id?: string;
    card_details?: { card?: { card_brand?: string; last_4?: string } };
  };
  errors?: { code?: string; detail?: string; category?: string }[];
}

export interface ChargeOrderInput {
  sourceId: string;
  orderId: string;
  locationId: string;
  amount: SquareMoney;
  note?: string;
}

export class PaymentDeclinedError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PaymentDeclinedError";
    this.code = code;
  }
}

/** Fan-readable text for the Square error codes a card charge can return. */
function declineMessage(code: string | undefined, detail: string | undefined): string {
  switch (code) {
    case "CARD_DECLINED":
    case "GENERIC_DECLINE":
      return "Your card was declined. Try another card.";
    case "CVV_FAILURE":
      return "The security code (CVV) did not match.";
    case "ADDRESS_VERIFICATION_FAILURE":
      return "The postal code did not match the card.";
    case "INSUFFICIENT_FUNDS":
      return "Insufficient funds on that card.";
    case "CARD_EXPIRED":
    case "INVALID_EXPIRATION":
      return "That card has expired or the expiry date is wrong.";
    case "INVALID_CARD":
    case "INVALID_CARD_DATA":
      return "The card details look invalid. Check the number and try again.";
    default:
      return detail ?? "The payment did not go through. Try again.";
  }
}

export async function chargeOrder(input: ChargeOrderInput): Promise<SquarePaymentResult> {
  if (!isSquareConfigured()) {
    console.warn("[square/payments] SQUARE_ACCESS_TOKEN not set — returning a mock payment, no card was charged.");
    return {
      paymentId: `MOCK-PAYMENT-${idempotencyKey("pay")}`,
      status: "COMPLETED",
      amount: input.amount,
      receiptUrl: null,
      cardBrand: "MOCK",
      cardLast4: "0000",
    };
  }

  let data: CreatePaymentResponse;
  try {
    data = await squareRequest<CreatePaymentResponse>("/v2/payments", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: idempotencyKey("pay"),
        source_id: input.sourceId,
        amount_money: input.amount,
        order_id: input.orderId,
        location_id: input.locationId,
        autocomplete: true,
        ...(input.note ? { note: input.note } : {}),
      }),
    });
  } catch (err) {
    if (err instanceof SquareApiError) {
      const first = (err.body as CreatePaymentResponse | null)?.errors?.[0];
      throw new PaymentDeclinedError(declineMessage(first?.code, first?.detail), first?.code ?? `HTTP_${err.status}`);
    }
    throw err;
  }

  const p = data.payment;
  if (!p) {
    const first = data.errors?.[0];
    throw new PaymentDeclinedError(declineMessage(first?.code, first?.detail), first?.code ?? "NO_PAYMENT");
  }
  return {
    paymentId: p.id,
    status: p.status ?? "UNKNOWN",
    amount: p.amount_money ?? input.amount,
    receiptUrl: p.receipt_url ?? null,
    cardBrand: p.card_details?.card?.card_brand ?? null,
    cardLast4: p.card_details?.card?.last_4 ?? null,
  };
}

/** Marks a $0 order as paid (no payments) so it reaches the register. */
export async function markZeroOrderPaid(orderId: string, orderVersion: number): Promise<void> {
  if (!isSquareConfigured() || orderId.startsWith("MOCK-")) return;
  await squareRequest(`/v2/orders/${orderId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: idempotencyKey("pay0"),
      order_version: orderVersion,
      payment_ids: [],
    }),
  });
}
