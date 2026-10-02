// Live busyness from real Square order volume.
//
// WHY ORDER RATE, NOT QUEUE DEPTH: measured against the live account on
// 2026-10-02, a game night (Sep 26-27) carried 1,999 orders of which 1,993
// came from Point of Sale. POS orders write an IN_STORE fulfillment that is
// already COMPLETED, and close ~2.3s after creation — that is the card
// payment, not the food. Exactly 2 orders were ever PROPOSED all night. So
// open fulfillments are not a queue, and created_at -> closed_at is not a
// prep time. Order rate is the only honest live signal this account gives us,
// which is also why this module exposes no wait estimate.
//
// SCOPE: only the four configured launch stands are ever queried. The access
// token reaches 62 locations across the GSL group; never widen the filter.

import { isSquareConfigured, squareRequest } from "./client";
import { getConfiguredStandSlots } from "./config";

/** Rolling window the live rate is measured over. */
export const WINDOW_MINUTES = 15;

/** Busyness older than this is not shown as live. */
export const MAX_AGE_MS = 5 * 60 * 1000;

export type BusynessState = "live" | "closed" | "unknown";

export interface StandBusyness {
  locationId: string;
  state: BusynessState;
  /** 0-1, only when state is "live". Never a raw order count. */
  heat: number | null;
  label: string | null;
}

export interface BusynessSnapshot {
  asOf: string; // ISO
  stands: StandBusyness[];
}

/**
 * Orders per minute each stand sustains when it is genuinely slammed — the
 * p95 of its 15-minute rates across the active buckets of a real game night
 * (Sep 26-27, 2026: 14 active buckets of >=20 orders across the four stands).
 *
 * Seeds only. Once there is enough history, refreshReferenceRates() recomputes
 * these from game nights and caches the result; quiet weekdays are excluded
 * deliberately, because averaging them in would drag the p95 down until every
 * game night read "Very busy".
 */
const SEED_REFERENCE_RATES: Record<string, number> = {
  "06KYFX4ZMH3XB": 7.2, // Island Canteen
  LARSXNSYK7Z6G: 3.867, // Island Slice
  L21YPQA79XH0J: 3.333, // TacoTacoTaco
  LZQZQS9G9XF1M: 4.333, // ReMax Fan Deck
};

/** Fallback for a stand with no seed and no history yet. */
const DEFAULT_REFERENCE_RATE = 4;

export function referenceRateFor(locationId: string, learned?: Record<string, number>): number {
  return learned?.[locationId] ?? SEED_REFERENCE_RATES[locationId] ?? DEFAULT_REFERENCE_RATE;
}

/**
 * The same five bands the map and list already use. Kept here so the label a
 * fan reads and the colour they see come from one number.
 */
export function heatLabel(heat: number): string {
  if (heat < 0.15) return "Quiet";
  if (heat < 0.35) return "Low";
  if (heat < 0.55) return "Moderate";
  if (heat < 0.75) return "Busy";
  return "Very busy";
}

export function heatFromRate(ordersPerMinute: number, referenceRate: number): number {
  if (referenceRate <= 0) return 0;
  return Math.max(0, Math.min(1, ordersPerMinute / referenceRate));
}

interface SearchOrdersResponse {
  orders?: { location_id: string; created_at: string }[];
  cursor?: string;
  errors?: { detail?: string }[];
}

/**
 * Order counts per location over the window. ONE Square call for all four
 * stands — never one per stand, and never one per page view (see the cache in
 * api/busyness). Counts stay server-side: they are Eventium's sales figures.
 */
export async function fetchOrderCounts(
  locationIds: string[],
  windowMinutes: number = WINDOW_MINUTES,
  now: Date = new Date()
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of locationIds) counts[id] = 0;
  if (locationIds.length === 0) return counts;

  const startAt = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
  let cursor: string | undefined;

  do {
    const data: SearchOrdersResponse = await squareRequest<SearchOrdersResponse>("/v2/orders/search", {
      method: "POST",
      body: JSON.stringify({
        location_ids: locationIds,
        limit: 500,
        ...(cursor ? { cursor } : {}),
        query: {
          filter: {
            date_time_filter: { created_at: { start_at: startAt, end_at: now.toISOString() } },
            // CANCELED orders are excluded: a voided sale is not busyness.
            state_filter: { states: ["OPEN", "COMPLETED"] },
          },
          sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
        },
      }),
    });
    for (const o of data.orders ?? []) {
      if (o.location_id in counts) counts[o.location_id] += 1;
    }
    cursor = data.cursor;
  } while (cursor);

  return counts;
}

/**
 * Builds the snapshot a fan sees. `openByLocation` comes from the staff
 * open/close switch: a closed stand reports "Closed" and no busyness, because
 * a closed stand's order rate is zero and would otherwise read a reassuring
 * "Quiet".
 */
export async function computeBusyness(
  openByLocation: Record<string, boolean>,
  learnedRates?: Record<string, number>,
  now: Date = new Date()
): Promise<BusynessSnapshot> {
  const slots = getConfiguredStandSlots();
  const openIds = slots.map((s) => s.locationId).filter((id) => openByLocation[id]);

  // Only query the stands that are actually open — fewer orders to page
  // through, and a closed stand's rate is not used for anything.
  const counts = openIds.length > 0 && isSquareConfigured() ? await fetchOrderCounts(openIds, WINDOW_MINUTES, now) : {};

  return {
    asOf: now.toISOString(),
    stands: slots.map(({ locationId }) => {
      if (!openByLocation[locationId]) {
        return { locationId, state: "closed" as const, heat: null, label: null };
      }
      if (!isSquareConfigured()) {
        return { locationId, state: "unknown" as const, heat: null, label: null };
      }
      const perMinute = (counts[locationId] ?? 0) / WINDOW_MINUTES;
      // Rounded to 2dp: enough for a colour, coarse enough that a page view
      // cannot be read back as an order count.
      const heat = Math.round(heatFromRate(perMinute, referenceRateFor(locationId, learnedRates)) * 100) / 100;
      return { locationId, state: "live" as const, heat, label: heatLabel(heat) };
    }),
  };
}
