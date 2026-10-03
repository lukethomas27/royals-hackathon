import { NextRequest, NextResponse } from "next/server";
import { resolvePromo } from "@/lib/square/promo";

/** Lets checkout label the code and hide the card form when the code makes
 * the order free. The server re-validates on /api/quote and /api/orders
 * regardless, and Square prices the actual discount. */
export async function GET(req: NextRequest) {
  const promo = resolvePromo(req.nextUrl.searchParams.get("code"));
  return NextResponse.json(
    promo ? { valid: true, percentage: promo.percentage, free: promo.free } : { valid: false }
  );
}
