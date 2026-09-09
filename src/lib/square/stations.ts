// Live section discovery from Square Online's public storefront endpoint.
//
// Per build doc section 6: Matt confirmed on Jul 28 that this data already
// exists inside Square as "Ordering Stations" under the
// `SOFMC ReMax Fan Deck QR Code Ordering` site — the v2 assumption that we'd
// hand-build a seat database was explicitly withdrawn. THE SEAT PICKER IS A
// READ, NOT A DATA-MODELLING EXERCISE.
//
// Embedded seats are truncated to ten per section. Never treat that sample
// as a complete seat map; row/seat remain user entry.

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

interface SeatGroupResponse {
  data?: { name?: string }[];
  meta?: { pagination?: { total?: number; count?: number } };
}

export async function fetchLiveOrderingStations(): Promise<OrderingStationsResult> {
  const endpoint = process.env.SQUARE_ORDERING_STATIONS_URL;
  if (!endpoint) return { availability: "unavailable" };
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.hostname !== "cdn5.editmysite.com") {
      throw new Error("Ordering stations must use the verified Square Online endpoint.");
    }
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Ordering stations returned ${response.status}`);
    const result: SeatGroupResponse = await response.json();
    if (!Array.isArray(result.data)) throw new Error("Invalid ordering stations response");
    const total = result.meta?.pagination?.total;
    if (total !== undefined && total > result.data.length) throw new Error("Incomplete section list");
    const allowed = getInSeatSections();
    const sections = [...new Set(result.data.flatMap((group) => {
      const section = group.name?.match(/^Section\s+(\d+)$/i)?.[1];
      return section && allowed.has(section) ? [section] : [];
    }))];
    return { availability: "live", sections };
  } catch {
    return { availability: "unavailable", sections: [] };
  }
}

export interface SeatPickerConfig {
  mode: "live" | "fallback" | "unavailable";
  validSections: string[];
}

export async function getSeatPickerConfig(): Promise<SeatPickerConfig> {
  const live = await fetchLiveOrderingStations();
  if (live.availability === "live" && live.sections) {
    return { mode: "live", validSections: live.sections };
  }
  if (process.env.SQUARE_ORDERING_STATIONS_URL) return { mode: "unavailable", validSections: [] };
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
