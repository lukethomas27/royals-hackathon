export type FanCategory = "all" | "food" | "beer" | "drinks" | "snacks";

export const CATEGORY_OPTIONS: { value: FanCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "food", label: "Food" },
  { value: "beer", label: "Beer" },
  { value: "drinks", label: "Drinks" },
  { value: "snacks", label: "Snacks" },
];

// Map fan-friendly categories to the historical CSV data's category values.
// This only drives the heat-map / "best time to go" feature (section 10 of
// the build doc — the carried-forward differentiator), not live ordering.
const CATEGORY_DATA_MAP: Record<Exclude<FanCategory, "all">, string[]> = {
  food: ["Food"],
  beer: ["Beer"],
  drinks: ["NA Bev", "NA Bev PST Exempt", "Liquor", "Wine, Cider & Coolers"],
  snacks: ["Snack", "Snacks", "Sweets", "Extras"],
};

/** Returns data category strings for simulation filtering, or null for "all". */
export function getDataCategories(fan: FanCategory): Set<string> | null {
  if (fan === "all") return null;
  return new Set(CATEGORY_DATA_MAP[fan]);
}

/**
 * Which of the *currently launched* stands sell a category, for
 * highlighting on the heat map. All four launch stands (build doc section
 * 2) sell food, beer, drinks and snacks — the old prototype's
 * food/beer/drinks/snacks split only mattered for Phillips Bar and Portable
 * Stations, both dropped from launch scope. So today this is every active
 * stand's heat-map key for every category; kept as a function (not a
 * flattened constant) so a future stand that genuinely doesn't sell a
 * category can be excluded without touching call sites.
 *
 * `standHeatKeys` comes from the live stand list (see
 * src/lib/square/locations.ts Stand.heatmapKey) — never a hardcoded name.
 */
export function getActiveLocations(
  fan: FanCategory,
  standHeatKeys: string[]
): Set<string> | null {
  if (fan === "all") return null;
  return new Set(standHeatKeys);
}
