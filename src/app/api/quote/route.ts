import { NextRequest, NextResponse } from "next/server";
import { getStandByLocationId } from "@/lib/square/locations";
import { calculateOrder } from "@/lib/square/orders";
import { resolveCartLines, CartLineInput } from "@/lib/square/cart";
import { validateAlcoholLimits } from "@/lib/square/tax";
import { isPromoCodeValid, normalizePromoCode } from "@/lib/square/promo";
import { isSquareConfigured, SquareApiError } from "@/lib/square/client";
import { SquareOrderQuote } from "@/lib/square/types";

export const dynamic = "force-dynamic";

interface QuoteRequestBody {
  locationId: string;
  lines: CartLineInput[];
  promoCode?: string | null;
}

/**
 * Prices a cart through Square. This is the only source of the totals shown
 * at checkout — there is no local tax calculation, by design, so a failure
 * here must block the order rather than degrade to a guess.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as QuoteRequestBody;

  const stand = await getStandByLocationId(body.locationId);
  if (!stand) {
    return NextResponse.json({ error: "Unknown stand." }, { status: 400 });
  }

  const cart = await resolveCartLines(stand.locationId, body.lines);
  if (!cart.ok) {
    return NextResponse.json({ error: cart.error }, { status: cart.status });
  }

  const alcoholCheck = validateAlcoholLimits(cart.cartLines, cart.taxesById);
  const promoEntered = normalizePromoCode(body.promoCode);
  const promoValid = promoEntered.length > 0 && isPromoCodeValid(promoEntered);

  if (!isSquareConfigured()) {
    // Local dev with no credentials: mirror createOrder's mock behaviour so
    // the flow stays demoable. Not a fallback for a failed live call.
    const subtotalCents = cart.cartLines.reduce(
      (sum, l) => sum + (l.variation.priceMoney?.amount ?? 0) * l.quantity,
      0
    );
    const quote: SquareOrderQuote = {
      currency: "CAD",
      subtotalCents,
      discountCents: promoValid ? subtotalCents : 0,
      taxCents: 0,
      totalCents: promoValid ? 0 : subtotalCents,
      taxLines: [],
      source: "mock",
    };
    return NextResponse.json({ quote, requiresIdCheck: alcoholCheck.requiresIdCheck });
  }

  try {
    const quote = await calculateOrder({
      locationId: stand.locationId,
      lineItems: cart.cartLines.map((l) => ({
        catalogObjectId: l.variation.id,
        quantity: String(l.quantity),
      })),
      fulfillmentType: stand.role === "in_seat" ? "DELIVERY" : "PICKUP",
      seat: null,
      customerPhone: "",
      // Pricing-neutral placeholders: the fan has not typed a name yet, and
      // Square requires a recipient on the fulfillment. Neither affects price.
      recipientName: "Quote",
      standAddress: stand.address,
      fullDiscountName: promoValid ? `Promo ${promoEntered}` : null,
    });
    return NextResponse.json({
      quote: { ...quote, source: "live" as const },
      requiresIdCheck: alcoholCheck.requiresIdCheck,
    });
  } catch (err) {
    const detail = err instanceof SquareApiError ? err.body : String(err);
    console.error("[api/quote] Square could not price this cart", JSON.stringify(detail));
    return NextResponse.json(
      { error: "We couldn't price this order with Square just now." },
      { status: 502 }
    );
  }
}
