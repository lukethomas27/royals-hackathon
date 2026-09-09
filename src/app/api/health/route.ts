import { NextResponse } from "next/server";
import { isSquareConfigured } from "@/lib/square/client";
import { getConfiguredStandSlots } from "@/lib/square/config";

export const dynamic = "force-dynamic";

/** Non-secret deployment smoke check. Never returns credential values. */
export async function GET() {
  const redisConfigured = Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
  const standsConfigured = getConfiguredStandSlots().length === 4;
  const checks = {
    square: isSquareConfigured(),
    stands: standsConfigured,
    redis: redisConfigured,
    staffPasscode: Boolean(process.env.STAFF_PASSCODE),
    orderingStations: Boolean(process.env.SQUARE_ORDERING_STATIONS_URL),
    payments: false,
  };
  const ready = checks.square && checks.stands && checks.redis && checks.staffPasscode;
  return NextResponse.json(
    { status: ready ? "ok" : "blocked", checks },
    { status: ready ? 200 : 503 }
  );
}
