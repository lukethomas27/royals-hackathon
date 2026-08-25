import { NextRequest, NextResponse } from "next/server";
import { getStandByLocationId } from "@/lib/square/locations";
import { getMenu } from "@/lib/square/catalog";
import { createOrder } from "@/lib/square/orders";
import { validateAlcoholLimits, CartLine } from "@/lib/square/tax";
import { getSeatPickerConfig, validateSeatSelection } from "@/lib/square/stations";
import { getStandOrderingState, isOrderingOpen } from "@/lib/staffState";

const PHONE_RE = /^\+?[0-9\s()-]{10,15}$/;

interface OrderRequestBody {
  locationId: string;
  customerPhone: string;
  smsOptIn: boolean;
  lines: { itemId: string; variationId: string; quantity: number }[];
  seat?: { section: string; row: string; seat: string } | null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as OrderRequestBody;

  if (!body.customerPhone || !PHONE_RE.test(body.customerPhone)) {
    return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
  }
  if (!body.lines?.length) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
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
    const validation = validateSeatSelection(body.seat, config.validSections);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    seat = body.seat;
  }

  const result = await createOrder({
    locationId: stand.locationId,
    lineItems: cartLines.map((l) => ({
      catalogObjectId: l.variation.id,
      quantity: String(l.quantity),
    })),
    fulfillmentType: stand.role === "in_seat" ? "DELIVERY" : "PICKUP",
    seat,
    customerPhone: body.customerPhone,
    requiresIdCheckNote: alcoholCheck.requiresIdCheck ? "ID CHECK REQUIRED AT HANDOFF" : undefined,
  });

  return NextResponse.json({
    orderId: result.orderId,
    requiresIdCheck: alcoholCheck.requiresIdCheck,
    smsOptIn: body.smsOptIn,
  });
}
