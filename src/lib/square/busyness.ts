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
import { tillsFor } from "./tills";

/** Rolling window the live rate is measured over. */
export const WINDOW_MINUTES = 15;

/**
 * Short window that caps the rate, so busyness tapers off fast. A flat
 * 15-minute average keeps counting a rush that ended ten minutes ago: a stand
 * that has gone dead kept reading "Busy" for up to 15 minutes. Taking the
 * lower of the two rates (see orderRate) means busyness can only be as high
 * as the last 5 minutes support, while the climb into a rush is still
 * governed by the 15-minute window exactly as before.
 */
export const RECENT_WINDOW_MINUTES = 5;

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
 * Orders per minute PER TILL that any stand sustains when genuinely slammed —
 * one shared number, which is what makes busyness comparable across stands.
 *
 * Seeded from the highest observed per-till rate on a real game night
 * (Sep 26-27, 2026) times 1.15. The headroom keeps a normal intermission high
 * without pinning it, leaving room for a worse night to read worse.
 *
 * Derived from one night. Recompute once there are several game nights of
 * history; quiet days must be excluded, or the reference would sag until every
 * game read "Very busy".
 */
const SEED_PER_TILL_REFERENCE = 1.107;

export function perTillReference(learned?: number): number {
  return learned ?? SEED_PER_TILL_REFERENCE;
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

/**
 * Busyness from order rate and serving capacity.
 *
 * Dividing by tills is what lets two stands be compared: Concession 1 takes
 * nearly double anyone else's orders at intermission but runs the most tills,
 * so per till it is the LEAST pressed — the opposite of what raw rate says,
 * and the answer a fan deciding where to walk actually needs.
 */
/**
 * Orders per minute from the two windows: slow to rise, quick to fall.
 *
 * - Rising (orders arriving faster than the 15-min average): the recent rate
 *   is the higher one, so the 15-min rate wins — unchanged behaviour.
 * - Falling (stand going quiet): the recent rate drops first and wins. With
 *   no orders at all, busyness reaches zero RECENT_WINDOW_MINUTES after the
 *   last sale instead of WINDOW_MINUTES.
 */
export function orderRate(recentCount: number, windowCount: number): number {
  return Math.min(recentCount / RECENT_WINDOW_MINUTES, windowCount / WINDOW_MINUTES);
}

export function heatFromRate(ordersPerMinute: number, tills: number, reference: number): number {
  if (tills <= 0 || reference <= 0) return 0;
  return Math.max(0, Math.min(1, ordersPerMinute / tills / reference));
}

interface SearchOrdersResponse {
  orders?: { location_id: string; created_at: string }[];
  cursor?: string;
  errors?: { detail?: string }[];
}

/**
 * Order counts per location for several trailing windows at once (e.g. last
 * 5 and last 15 minutes), from ONE SearchOrders query over the widest window.
 * ONE Square call for all four stands — never one per stand, and never one
 * per page view (see the cache in api/busyness).
 * Counts every order Square has for the stand — Point of Sale and this app
 * alike — excluding CANCELED.
 *
 * Raw counts are Eventium's sales figures: only the passcode-gated staff
 * route (api/staff/orders) may return them, never a fan-facing route.
 */
export async function fetchRecentOrderCounts(
  locationIds: string[],
  windowsMinutes: number[],
  now: Date = new Date()
): Promise<Record<string, Record<number, number>>> {
  const counts: Record<string, Record<number, number>> = {};
  for (const id of locationIds) {
    counts[id] = {};
    for (const w of windowsMinutes) counts[id][w] = 0;
  }
  if (locationIds.length === 0 || windowsMinutes.length === 0) return counts;

  const widest = Math.max(...windowsMinutes);
  const startAt = new Date(now.getTime() - widest * 60_000).toISOString();
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
      const perWindow = counts[o.location_id];
      if (!perWindow) continue;
      const ageMinutes = (now.getTime() - new Date(o.created_at).getTime()) / 60_000;
      for (const w of windowsMinutes) {
        if (ageMinutes <= w) perWindow[w] += 1;
      }
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
  learnedPerTillReference?: number,
  now: Date = new Date()
): Promise<BusynessSnapshot> {
  const slots = getConfiguredStandSlots();
  const openIds = slots.map((s) => s.locationId).filter((id) => openByLocation[id]);

  // Only query the stands that are actually open — fewer orders to page
  // through, and a closed stand's rate is not used for anything.
  const counts =
    openIds.length > 0 && isSquareConfigured()
      ? await fetchRecentOrderCounts(openIds, [RECENT_WINDOW_MINUTES, WINDOW_MINUTES], now)
      : {};

  return {
    asOf: now.toISOString(),
    stands: slots.map(({ locationId }) => {
      if (!openByLocation[locationId]) {
        return { locationId, state: "closed" as const, heat: null, label: null };
      }
      if (!isSquareConfigured()) {
        return { locationId, state: "unknown" as const, heat: null, label: null };
      }
      const c = counts[locationId];
      const perMinute = c ? orderRate(c[RECENT_WINDOW_MINUTES], c[WINDOW_MINUTES]) : 0;
      // Rounded to 2dp: enough for a colour, coarse enough that a page view
      // cannot be read back as an order count or a till count.
      const heat =
        Math.round(
          heatFromRate(perMinute, tillsFor(locationId), perTillReference(learnedPerTillReference)) * 100
        ) / 100;
      return { locationId, state: "live" as const, heat, label: heatLabel(heat) };
    }),
  };
}
