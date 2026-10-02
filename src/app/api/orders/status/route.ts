import { NextRequest, NextResponse } from "next/server";
import { getOrderStatuses } from "@/lib/square/orderStatus";
import { MAX_STATUS_IDS } from "@/lib/orderStage";
import { SquareApiError } from "@/lib/square/client";

export const dynamic = "force-dynamic";

/**
 * GET ?ids=a,b — current stage of the fan's own orders, polled by the open
 * tracker. One Square BatchRetrieveOrders call per poll, whatever the count.
 * Returns stages only; see src/lib/square/orderStatus.ts for the mapping and
 * the four-stand scope.
 */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.length > MAX_STATUS_IDS) {
    return NextResponse.json({ error: `Pass 1-${MAX_STATUS_IDS} order ids.` }, { status: 400 });
  }

  try {
    const orders = await getOrderStatuses(ids);
    return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // The tracker keeps its last known stage and retries; nothing for the fan
    // to act on, so no detail goes back to the browser.
    const detail = err instanceof SquareApiError ? JSON.stringify(err.body) : String(err);
    console.error("[api/orders/status] Square read failed", detail);
    return NextResponse.json({ error: "Order status is temporarily unavailable." }, { status: 502 });
  }
}
