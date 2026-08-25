// Stand configuration.
//
// Per the build doc (section 2): "names are going to change in the coming
// weeks. Do not hardcode stand names anywhere. Key off Square location IDs
// and render the display name from Square."
//
// So this file keys everything off *position slots* (purely geometric, for
// laying the four stands out on the arena map) and *fulfillment role*
// (pickup vs in-seat delivery) — never off a business name. The actual
// Square location ID for each slot comes from env vars, and the label shown
// to fans always comes from the live Square location/catalog response.
//
// Set these once real Square access + the 4 launch location IDs are
// confirmed (section 2 of the build doc):
//   SQUARE_STAND_SLOT_1_LOCATION_ID
//   SQUARE_STAND_SLOT_2_LOCATION_ID
//   SQUARE_STAND_SLOT_3_LOCATION_ID
//   SQUARE_STAND_SLOT_4_LOCATION_ID  (this is the in-seat delivery stand)
//   SQUARE_INSEAT_SLOT=4                         (which slot is delivery; default 4)
//   SQUARE_INSEAT_SECTIONS=107,108,109,110,111   (delivery footprint safety net)
//   STAFF_PASSCODE                               (staff open/close control, section 6a)

export type FulfillmentRole = "pickup" | "in_seat";

export interface StandSlotConfig {
  slot: number;
  locationId: string;
  role: FulfillmentRole;
}

const SLOT_COUNT = 4;

/** Reads the 4 launch stands from env. Returns [] if not configured yet (dev). */
export function getConfiguredStandSlots(): StandSlotConfig[] {
  const inSeatSlot = Number(process.env.SQUARE_INSEAT_SLOT ?? "4");
  const slots: StandSlotConfig[] = [];

  for (let i = 1; i <= SLOT_COUNT; i++) {
    const locationId = process.env[`SQUARE_STAND_SLOT_${i}_LOCATION_ID`];
    if (!locationId) continue;
    slots.push({
      slot: i,
      locationId,
      role: i === inSeatSlot ? "in_seat" : "pickup",
    });
  }
  return slots;
}

/**
 * Delivery footprint safety net (section 2: "sections 107 to 111 only").
 * This is a fallback validation layer, not the source of truth — the seat
 * picker itself should read live from Square's Ordering Stations (section
 * 6). Kept here so an obviously-wrong section can never be submitted even
 * if the live read is temporarily unavailable.
 */
export function getInSeatSections(): Set<string> {
  const raw = process.env.SQUARE_INSEAT_SECTIONS ?? "107,108,109,110,111";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * The in-seat stand's own physical arena section (section 2: "The ReMax Fan
 * Deck sits at section 108"). This is a venue/geography fact tied to the
 * physical concession, not a business name — kept configurable in case
 * Eventium ever relocates the in-seat stand to a different physical spot.
 */
export function getInSeatPhysicalSection(): string {
  return process.env.SQUARE_INSEAT_PHYSICAL_SECTION ?? "108";
}

export function getStaffPasscode(): string | null {
  return process.env.STAFF_PASSCODE ?? null;
}

/**
 * The historical transaction dataset (14 months, 68 games, section 10 of
 * the build doc) is a frozen CSV export keyed by the *old* stand name
 * strings (e.g. "SOFMC Island Canteen") — that's the only identifier that
 * export will ever have, and it predates this project's Square-location-ID
 * rule. This map links a launch slot to its historical CSV key purely so
 * the busy-ness / "best time to go" heat feature (section 10: the genuine
 * carried-forward asset) can still find its data. It is NOT used for
 * display, ordering, or anything fan-facing — those are 100% live off
 * SQUARE_STAND_SLOT_*_LOCATION_ID. If a slot has no historical key
 * configured, the heat model simply shows no data for it instead of
 * guessing.
 */
// Demo-only fallback so `npm run dev` shows real heat data out of the box
// before anyone has set the env vars above. Real launch config should set
// SQUARE_STAND_SLOT_*_HEATMAP_KEY explicitly rather than rely on this.
const DEMO_HEATMAP_DEFAULTS: Record<number, string> = {
  1: "SOFMC Island Canteen",
  2: "SOFMC Island Slice",
  3: "SOFMC TacoTacoTaco",
  4: "SOFMC ReMax Fan Deck",
};

export function getHeatmapKeyForSlot(slot: number, allowDemoDefault = false): string | null {
  const configured = process.env[`SQUARE_STAND_SLOT_${slot}_HEATMAP_KEY`];
  if (configured) return configured;
  return allowDemoDefault ? DEMO_HEATMAP_DEFAULTS[slot] ?? null : null;
}

/**
 * Fixed x/y geometry per slot, used only to lay the 4 stands out on the
 * arena SVG. Purely positional — carries no business meaning and needs no
 * update when Eventium renames a stand.
 */
export const SLOT_LAYOUT: Record<number, { x: number; y: number }> = {
  1: { x: -120, y: -1 }, // upper-left arc
  2: { x: 110, y: -1 }, // upper-right arc
  3: { x: 90, y: 1 }, // lower-right arc
  4: { x: 1, y: 0 }, // side concourse (in-seat delivery stand)
};
