import { NextResponse } from "next/server";
import { isSquareConfigured } from "@/lib/square/client";
import { getConfiguredStandSlots } from "@/lib/square/config";
import { getPromoCode } from "@/lib/square/promo";

export const dynamic = "force-dynamic";

/** Non-secret deployment smoke check. Never returns credential values. */
export async function GET() {
  const redisConfigured = Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
  const standsConfigured = getConfiguredStandSlots().length === 4;
  const square = isSquareConfigured();
  const checks = {
    square,
    environment: process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox",
    stands: standsConfigured,
    redis: redisConfigured,
    staffPasscode: Boolean(process.env.STAFF_PASSCODE),
    orderingStations: Boolean(process.env.SQUARE_ORDERING_STATIONS_URL),
    payments: square && Boolean(process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID),
    // True only while a 100%-off test code is live. Must be false at launch.
    promoCodeActive: Boolean(getPromoCode()),
  };
  const ready = checks.square && checks.stands && checks.redis && checks.staffPasscode && checks.payments;
  return NextResponse.json(
    { status: ready ? "ok" : "blocked", checks },
    { status: ready ? 200 : 503 }
  );
}
