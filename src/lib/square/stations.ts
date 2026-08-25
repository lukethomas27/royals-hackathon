// Seat/row data for the in-seat delivery stand (sections 107-111 only).
//
// Per build doc section 6: Matt confirmed on Jul 28 that this data already
// exists inside Square as "Ordering Stations" under the
// `SOFMC ReMax Fan Deck QR Code Ordering` site — the v2 assumption that we'd
// hand-build a seat database was explicitly withdrawn. THE SEAT PICKER IS A
// READ, NOT A DATA-MODELLING EXERCISE.
//
// UNRESOLVED (build doc's own words: "This is the one thing that could
// still turn into manual data entry, so check it early rather than
// assuming"): whether Ordering Stations are exposed through a public API at
// all, or only visible in the Square Online site dashboard UI. Square does
// not currently document a general "Ordering Stations" REST resource for
// Square Online QR-ordering sites — this is very likely dashboard/site
// configuration rather than Catalog/Locations data, which would mean it is
// NOT reachable via the standard Square API this app otherwise uses.
//
// This module is written so that:
//   1. If/when someone with Square dashboard access confirms an API (or a
//      documented site-export mechanism) for Ordering Stations, the fetch
//      goes in fetchLiveOrderingStations() below and getSeatOptions()
//      starts returning real data with no caller-side changes needed.
//   2. Until then, we do NOT hand-type the CLUB MAP seat list into this
//      codebase (that would silently violate "no hardcoded seat maps" the
//      moment Eventium changes the footprint). Instead the seat picker
//      degrades to a constrained free-text prompt — section/row/seat —
//      validated only against the safety-net section list in config.ts.

import { getInSeatSections } from "./config";

export interface SeatSelection {
  section: string;
  row: string;
  seat: string;
}

export type OrderingStationsAvailability = "live" | "unavailable";

export interface OrderingStationsResult {
  availability: OrderingStationsAvailability;
  // Populated only when availability === "live".
  sections?: string[];
}

/**
 * Attempts a live read. Returns "unavailable" today because there is no
 * confirmed API for this — see the file header. Once that's confirmed,
 * replace this body with the real call; nothing else in the app needs to
 * change (see getSeatOptions below).
 */
export async function fetchLiveOrderingStations(): Promise<OrderingStationsResult> {
  return { availability: "unavailable" };
}

export interface SeatPickerConfig {
  mode: "live" | "fallback";
  validSections: string[];
}

export async function getSeatPickerConfig(): Promise<SeatPickerConfig> {
  const live = await fetchLiveOrderingStations();
  if (live.availability === "live" && live.sections) {
    return { mode: "live", validSections: live.sections };
  }
  return { mode: "fallback", validSections: Array.from(getInSeatSections()) };
}

export function isValidSeatSection(section: string, validSections: string[]): boolean {
  return validSections.includes(section.trim());
}

/** Very loose shape validation for the fallback free-text path. */
export function validateSeatSelection(
  selection: SeatSelection,
  validSections: string[]
): { ok: boolean; error?: string } {
  if (!isValidSeatSection(selection.section, validSections)) {
    return {
      ok: false,
      error: `Delivery is only available in sections ${validSections.join(", ")}. Everything else routes to pickup.`,
    };
  }
  if (!selection.row.trim() || !selection.seat.trim()) {
    return { ok: false, error: "Enter your row and seat number." };
  }
  return { ok: true };
}
