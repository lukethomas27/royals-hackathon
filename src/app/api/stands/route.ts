import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getMenu } from "@/lib/square/catalog";
import { getStands } from "@/lib/square/locations";
import { fanStandName } from "@/lib/square/standNames";
import { getInSeatPhysicalSection } from "@/lib/square/config";
import { isSquareConfigured } from "@/lib/square/client";
import { getStandOrderingState, isOrderingOpen } from "@/lib/staffState";

/**
 * A short "what they sell" line per stand, from the live menu's own reporting
 * categories. Cached for 5 minutes so this never becomes a Square call per
 * page view — the same rule the busyness route follows.
 */
const SELLS_KEY = "arenapulse:stand-sells:v1";
const SELLS_TTL_MS = 5 * 60 * 1000;
let sellsMemory: { at: number; value: Record<string, StandSummary> } | null = null;

function redisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

interface StandSummary { sells: string | null; photoUrl: string | null }

async function summaryByLocation(locationIds: string[]): Promise<Record<string, StandSummary>> {
  const redis = redisClient();
  if (redis) {
    try {
      const hit = await redis.get<Record<string, StandSummary>>(SELLS_KEY);
      if (hit) return hit;
    } catch {
      // fall through to a recompute
    }
  } else if (sellsMemory && Date.now() - sellsMemory.at < SELLS_TTL_MS) {
    return sellsMemory.value;
  }

  const out: Record<string, StandSummary> = {};
  await Promise.all(
    locationIds.map(async (id) => {
      try {
        const { items } = await getMenu(id);
        // Square's reporting categories are accounting labels, not menu copy:
        // "NA Bev PST Exempt" means nothing to a fan. Drop the bookkeeping
        // ones, rename the rest, and lead with whatever the stand sells most of.
        const counts = new Map<string, number>();
        for (const item of items) {
          const raw = item.categoryName;
          if (!raw) continue;
          if (/pst exempt|extras?$|^other$/i.test(raw)) continue;
          const name = /^na bev/i.test(raw)
            ? "Soft drinks"
            : /wine|cider|cooler/i.test(raw)
              ? "Wine & coolers"
              : raw;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
        // A real photo from this stand's own menu beats a letter placeholder.
        // Take one from the category the stand sells most of, so the four
        // cards don't all land on whatever is first alphabetically.
        const lead = top[0];
        const inLead = lead
          ? items.find((i) => {
              const raw = i.categoryName ?? "";
              const mapped = /^na bev/i.test(raw)
                ? "Soft drinks"
                : /wine|cider|cooler/i.test(raw)
                  ? "Wine & coolers"
                  : raw;
              return mapped === lead && i.imageUrl;
            })
          : undefined;
        const photo = (inLead ?? items.find((i) => i.imageUrl))?.imageUrl ?? null;
        out[id] = { sells: top.length ? top.slice(0, 3).join(" · ") : null, photoUrl: photo };
      } catch {
        // A stand with no readable menu simply gets no line.
      }
    })
  );

  sellsMemory = { at: Date.now(), value: out };
  if (redis) {
    try {
      await redis.set(SELLS_KEY, out, { px: SELLS_TTL_MS });
    } catch {
      // cache write failures are not worth failing the request over
    }
  }
  return out;
}

export async function GET() {
  const stands = await getStands();
  const summaries = await summaryByLocation(stands.map((s) => s.locationId));
  const withState = await Promise.all(
    stands.map(async (s) => {
      const ordering = await getStandOrderingState(s.locationId);
      // fanName is what the fan UI shows; displayName stays Square's live name
      // so order data, the payment note and staff views match the register.
      return {
        ...s,
        fanName: fanStandName(s.locationId, s.displayName),
        sells: summaries[s.locationId]?.sells ?? null,
        photoUrl: summaries[s.locationId]?.photoUrl ?? null,
        ordering,
        isOpen: isOrderingOpen(ordering),
      };
    })
  );
  return NextResponse.json({
    stands: withState,
    inSeatPhysicalSection: getInSeatPhysicalSection(),
    // What the browser needs to load Square's Web Payments SDK. The app ID
    // is a public client-side value; the access token never leaves the server.
    square: {
      configured: isSquareConfigured(),
      applicationId: process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? null,
      environment: process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox",
    },
  });
}
