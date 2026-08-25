// Live location reads. Display names ALWAYS come from here (or the mock
// equivalent in dev) — never hardcoded. See config.ts for why stands are
// keyed by position slot + location ID instead of name.

import { isSquareConfigured, squareRequest } from "./client";
import { getConfiguredStandSlots, getHeatmapKeyForSlot, SLOT_LAYOUT, StandSlotConfig } from "./config";
import { SquareLocation } from "./types";
import { MOCK_LOCATIONS } from "./mock";

export interface Stand {
  slot: number;
  locationId: string;
  role: "pickup" | "in_seat";
  displayName: string; // live from Square (or mock), never hardcoded
  x: number;
  y: number;
  heatmapKey: string | null; // links to the frozen historical CSV dataset, if configured
}

interface ListLocationsResponse {
  locations?: Array<{
    id: string;
    name: string;
    status: string;
    address?: { address_line_1?: string; locality?: string };
  }>;
}

async function fetchLiveLocations(): Promise<SquareLocation[]> {
  const data = await squareRequest<ListLocationsResponse>("/v2/locations");
  return (data.locations ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    status: l.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
    address: l.address,
  }));
}

/**
 * The four launch stands (build doc section 2), resolved to their live
 * Square display names. Falls back to mock data when SQUARE_ACCESS_TOKEN
 * isn't set, and to a demo slot config when the SQUARE_STAND_SLOT_* env
 * vars aren't set either, so `npm run dev` works out of the box.
 */
export async function getStands(): Promise<Stand[]> {
  const configured = getConfiguredStandSlots();
  const useMock = !isSquareConfigured();

  const slots: StandSlotConfig[] =
    configured.length > 0
      ? configured
      : useMock
      ? [
          { slot: 1, locationId: "LOC_MOCK_1", role: "pickup" },
          { slot: 2, locationId: "LOC_MOCK_2", role: "pickup" },
          { slot: 3, locationId: "LOC_MOCK_3", role: "pickup" },
          { slot: 4, locationId: "LOC_MOCK_4", role: "in_seat" },
        ]
      : [];

  const locations: SquareLocation[] = useMock
    ? MOCK_LOCATIONS
    : await fetchLiveLocations();

  const byId = new Map(locations.map((l) => [l.id, l]));

  return slots
    .map((s): Stand | null => {
      const loc = byId.get(s.locationId);
      if (!loc || loc.status !== "ACTIVE") return null;
      const layout = SLOT_LAYOUT[s.slot] ?? { x: 0, y: 0 };
      return {
        slot: s.slot,
        locationId: s.locationId,
        role: s.role,
        displayName: loc.name,
        x: layout.x,
        y: layout.y,
        heatmapKey: getHeatmapKeyForSlot(s.slot, useMock),
      };
    })
    .filter((s): s is Stand => s !== null);
}

export async function getStandByLocationId(locationId: string): Promise<Stand | null> {
  const stands = await getStands();
  return stands.find((s) => s.locationId === locationId) ?? null;
}
