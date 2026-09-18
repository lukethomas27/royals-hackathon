import { NextRequest, NextResponse } from "next/server";
import { getStandByLocationId } from "@/lib/square/locations";
import { getMenu } from "@/lib/square/catalog";
import { createOrder, cancelOrder } from "@/lib/square/orders";
import { chargeOrder, markZeroOrderPaid, PaymentDeclinedError } from "@/lib/square/payments";
import { isPromoCodeValid, normalizePromoCode } from "@/lib/square/promo";
import { validateAlcoholLimits, CartLine } from "@/lib/square/tax";
import { getSeatPickerConfig, validateSeatSelection } from "@/lib/square/stations";
import { getStandOrderingState, isOrderingOpen } from "@/lib/staffState";
import { isSquareConfigured } from "@/lib/square/client";

const PHONE_RE = /^\+?[0-9\s()-]{10,15}$/;
const NAME_MAX = 40;

interface OrderRequestBody {
  locationId: string;
  customerPhone: string;
  smsOptIn: boolean;
  lines: { itemId: string; variationId: string; quantity: number }[];
  seat?: { section: string; row: string; seat: string } | null;
  /** Optional pickup name. Falls back to "Fan ····1234". */
  recipientName?: string | null;
  /** Web Payments SDK card token. Required unless a valid promo code zeroes the order. */
  sourceId?: string | null;
  promoCode?: string | null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as OrderRequestBody;

  if (!body.customerPhone || !PHONE_RE.test(body.customerPhone)) {
    return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
  }
  if (!body.lines?.length) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }
  for (const line of body.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) {
      return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
    }
  }

  const stand = await getStandByLocationId(body.locationId);
  if (!stand) {
    return NextResponse.json({ error: "Unknown stand." }, { status: 400 });
  }

  // Section 6a: manual override / scheduled cutoff — checked server-side,
  // never trust a client that thinks ordering is still open.
  const orderingState = await getStandOrderingState(stand.locationId);
  if (!isOrderingOpen(orderingState)) {
    return NextResponse.json(
      { error: "This stand is not currently accepting online orders." },
      { status: 409 }
    );
  }

  // Promo: the only way to place an order without a card token.
  const promoEntered = normalizePromoCode(body.promoCode);
  const promoValid = promoEntered.length > 0 && isPromoCodeValid(promoEntered);
  if (promoEntered && !promoValid) {
    return NextResponse.json({ error: "That code is not valid." }, { status: 400 });
  }
  const live = isSquareConfigured();
  if (live && !promoValid && !body.sourceId) {
    return NextResponse.json({ error: "Card details are required." }, { status: 400 });
  }

  // Re-derive cart lines from the live menu — never trust client-submitted
  // prices or item validity.
  const { items, taxesById } = await getMenu(stand.locationId);
  const itemsById = new Map(items.map((i) => [i.id, i]));

  const cartLines: CartLine[] = [];
  for (const line of body.lines) {
    const item = itemsById.get(line.itemId);
    const variation = item?.variations.find((v) => v.id === line.variationId);
    if (!item || !variation || variation.soldOut || !item.onlineVisible) {
      return NextResponse.json(
        { error: `"${item?.name ?? line.itemId}" is no longer available.` },
        { status: 409 }
      );
    }
    cartLines.push({ item, variation, quantity: line.quantity });
  }

  const alcoholCheck = validateAlcoholLimits(cartLines, taxesById);
  if (!alcoholCheck.ok) {
    return NextResponse.json({ error: alcoholCheck.reason }, { status: 400 });
  }

  // In-seat delivery: validate section/row/seat against the seat picker
  // config (live Ordering Stations read if available, otherwise the
  // sections-only fallback — see src/lib/square/stations.ts).
  let seat: { section: string; row: string; seat: string } | null = null;
  if (stand.role === "in_seat") {
    if (!body.seat) {
      return NextResponse.json({ error: "Seat section, row and seat are required for delivery." }, { status: 400 });
    }
    const config = await getSeatPickerConfig();
    if (config.mode === "unavailable") {
      return NextResponse.json(
        { error: "Live seat data is temporarily unavailable. Please try again or choose pickup." },
        { status: 503 }
      );
    }
    const validation = validateSeatSelection(body.seat, config.validSections);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    seat = body.seat;
  }

  const digits = body.customerPhone.replace(/\D/g, "");
  const recipientName =
    (body.recipientName ?? "").trim().slice(0, NAME_MAX) || `Fan ····${digits.slice(-4)}`;

  const order = await createOrder({
    locationId: stand.locationId,
    lineItems: cartLines.map((l) => ({
      catalogObjectId: l.variation.id,
      quantity: String(l.quantity),
    })),
    fulfillmentType: stand.role === "in_seat" ? "DELIVERY" : "PICKUP",
    seat,
    customerPhone: body.customerPhone,
    recipientName,
    standAddress: stand.address,
    fullDiscountName: promoValid ? `Promo ${promoEntered}` : null,
    requiresIdCheckNote: alcoholCheck.requiresIdCheck ? "ID CHECK REQUIRED AT HANDOFF" : undefined,
  });

  // Pay it. Square only shows an order to staff once it is paid.
  let payment: Awaited<ReturnType<typeof chargeOrder>> | null = null;
  let paidWith: "card" | "promo" | "mock" = live ? "card" : "mock";
  try {
    if (order.totalMoney.amount === 0) {
      // 100% promo (or a genuinely free order): no card, PayOrder with no payments.
      await markZeroOrderPaid(order.orderId, order.version);
      if (promoValid) paidWith = "promo";
    } else {
      if (!body.sourceId) {
        // Promo was valid but did not zero the order — refuse rather than charge.
        await cancelOrder(order);
        return NextResponse.json({ error: "Card details are required." }, { status: 400 });
      }
      payment = await chargeOrder({
        sourceId: body.sourceId,
        orderId: order.orderId,
        locationId: order.locationId,
        amount: order.totalMoney,
        note: `${stand.displayName} · ${recipientName}`,
      });
    }
  } catch (err) {
    await cancelOrder(order);
    if (err instanceof PaymentDeclinedError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 402 });
    }
    console.error("[api/orders] payment step failed", err);
    return NextResponse.json({ error: "The payment did not go through. Try again." }, { status: 502 });
  }

  return NextResponse.json({
    orderId: order.orderId,
    paymentId: payment?.paymentId ?? null,
    paidWith,
    amount: payment?.amount ?? order.totalMoney,
    receiptUrl: payment?.receiptUrl ?? null,
    cardBrand: payment?.cardBrand ?? null,
    cardLast4: payment?.cardLast4 ?? null,
    requiresIdCheck: alcoholCheck.requiresIdCheck,
    smsOptIn: body.smsOptIn,
  });
}
