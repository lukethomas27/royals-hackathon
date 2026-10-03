import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getConfiguredStandSlots } from "@/lib/square/config";
import { getStandOrderingState, isOrderingOpen } from "@/lib/staffState";
import { computeBusyness, BusynessSnapshot, MAX_AGE_MS } from "@/lib/square/busyness";

export const dynamic = "force-dynamic";

/**
 * Live busyness for the fan UI.
 *
 * Square is called at most once per CACHE_TTL_MS for ALL four stands, never
 * once per stand and never once per page view. Clients poll this route.
 *
 * The cache is a cache, not state: unlike staff open/close, losing it costs a
 * refetch, so an in-process fallback is fine when Redis is not configured.
 */
const CACHE_TTL_MS = 30_000;
const CACHE_KEY = "arenapulse:busyness:v1";
/** Served while a refresh fails, until MAX_AGE_MS makes it "no live data". */
const STALE_SERVE_MS = MAX_AGE_MS;

let memoryCache: BusynessSnapshot | null = null;
let inFlight: Promise<BusynessSnapshot> | null = null;

function redisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function ageMs(snapshot: BusynessSnapshot): number {
  return Date.now() - new Date(snapshot.asOf).getTime();
}

async function readCache(): Promise<BusynessSnapshot | null> {
  const redis = redisClient();
  if (redis) {
    try {
      return (await redis.get<BusynessSnapshot>(CACHE_KEY)) ?? null;
    } catch {
      return memoryCache;
    }
  }
  return memoryCache;
}

async function writeCache(snapshot: BusynessSnapshot): Promise<void> {
  memoryCache = snapshot;
  const redis = redisClient();
  if (!redis) return;
  try {
    await redis.set(CACHE_KEY, snapshot, { px: STALE_SERVE_MS });
  } catch {
    // Cache write failures are not worth failing the request over.
  }
}

async function refresh(): Promise<BusynessSnapshot> {
  const slots = getConfiguredStandSlots();
  const openByLocation: Record<string, boolean> = {};
  await Promise.all(
    slots.map(async ({ locationId }) => {
      openByLocation[locationId] = isOrderingOpen(await getStandOrderingState(locationId));
    })
  );
  const snapshot = await computeBusyness(openByLocation);
  await writeCache(snapshot);
  return snapshot;
}

export async function GET() {
  const cached = await readCache();
  if (cached && ageMs(cached) < CACHE_TTL_MS) {
    return NextResponse.json(cached);
  }

  try {
    // Collapse concurrent misses into a single Square call.
    inFlight = inFlight ?? refresh().finally(() => (inFlight = null));
    return NextResponse.json(await inFlight);
  } catch (err) {
    console.error("[api/busyness] could not refresh from Square", err);
    // Serve the last good snapshot while it is still recent enough; the client
    // shows its age. Past that, every stand reports "no live data" rather than
    // a colour that looks current.
    if (cached && ageMs(cached) < STALE_SERVE_MS) {
      return NextResponse.json(cached);
    }
    return NextResponse.json(
      {
        asOf: new Date().toISOString(),
        stands: getConfiguredStandSlots().map(({ locationId }) => ({
          locationId,
          state: "unknown" as const,
          heat: null,
          label: null,
        })),
      },
      { status: 200 }
    );
  }
}
