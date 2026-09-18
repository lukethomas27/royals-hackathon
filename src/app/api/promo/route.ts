import { NextRequest, NextResponse } from "next/server";
import { isPromoCodeValid } from "@/lib/square/promo";

/** Lets checkout hide the card form once a valid code is entered. The
 * server re-validates on /api/orders regardless. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  return NextResponse.json({ valid: isPromoCodeValid(code) });
}
