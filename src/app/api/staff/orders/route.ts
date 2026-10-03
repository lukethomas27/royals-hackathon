import { NextRequest, NextResponse } from "next/server";
import { getConfiguredStandSlots, getStaffPasscode } from "@/lib/square/config";
import { isSquareConfigured } from "@/lib/square/client";
import { fetchRecentOrderCounts } from "@/lib/square/busyness";
import { isStaffAuthorized } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

/**
 * Recent order counts per stand, for the staff view ONLY.
 *
 * Raw counts are Eventium's sales figures, which is why every fan-facing
 * route (api/busyness included) reduces them to a rounded 0-1 heat. This
 * route returns them as-is, so it sits behind the staff passcode and refuses
 * outright in production if no passcode is set.
 *
 * Counts cover every order Square has for the stand — POS and this app —
 * whether or not app ordering is open: the tills keep selling either way.
 *
 * Square is called at most once per CACHE_TTL_MS for all four stands, however
 * many staff have the page open.
 */
const WINDOWS_MINUTES = [5, 15];
const CACHE_TTL_MS = 30_000;

interface StaffOrderCounts {
  asOf: string; // ISO
  windowsMinutes: number[];
  /** null when Square is unreachable or not configured (mock mode). */
  stands: { locationId: string; counts: Record<number, number> | null }[];
}

let cache: StaffOrderCounts | null = null;
let inFlight: Promise<StaffOrderCounts> | null = null;

async function refresh(): Promise<StaffOrderCounts> {
  const now = new Date();
  const ids = getConfiguredStandSlots().map((s) => s.locationId);
  const counts = isSquareConfigured() ? await fetchRecentOrderCounts(ids, WINDOWS_MINUTES, now) : null;
  const snapshot: StaffOrderCounts = {
    asOf: now.toISOString(),
    windowsMinutes: WINDOWS_MINUTES,
    stands: ids.map((locationId) => ({ locationId, counts: counts?.[locationId] ?? null })),
  };
  cache = snapshot;
  return snapshot;
}

export async function GET(req: NextRequest) {
  if (!getStaffPasscode() && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "STAFF_PASSCODE is not set" }, { status: 503 });
  }
  if (!isStaffAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cache && Date.now() - new Date(cache.asOf).getTime() < CACHE_TTL_MS) {
    return NextResponse.json(cache);
  }

  try {
    // Collapse concurrent misses into a single Square call.
    inFlight = inFlight ?? refresh().finally(() => (inFlight = null));
    return NextResponse.json(await inFlight);
  } catch (err) {
    console.error("[api/staff/orders] could not read order counts from Square", err);
    // The client shows asOf, so a stale snapshot reads as stale, not current.
    if (cache) return NextResponse.json(cache);
    return NextResponse.json({ error: "Could not reach Square" }, { status: 502 });
  }
}
