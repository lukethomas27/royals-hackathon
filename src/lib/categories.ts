export type FanCategory = "all" | "food" | "beer" | "drinks" | "snacks";

export const CATEGORY_OPTIONS: { value: FanCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "food", label: "Food" },
  { value: "beer", label: "Beer" },
  { value: "drinks", label: "Drinks" },
  { value: "snacks", label: "Snacks" },
];

// Map fan-friendly categories to actual CSV data category values
const CATEGORY_DATA_MAP: Record<Exclude<FanCategory, "all">, string[]> = {
  food: ["Food"],
  beer: ["Beer"],
  drinks: ["NA Bev", "NA Bev PST Exempt", "Liquor", "Wine, Cider & Coolers"],
  snacks: ["Snack", "Snacks", "Sweets", "Extras"],
};

// Which locations actually sell each fan category (verified from data)
// Food is the differentiator — Phillips Bar and Portable Stations don't sell food
const CATEGORY_LOCATION_MAP: Record<Exclude<FanCategory, "all">, string[]> = {
  food: [
    "SOFMC Island Canteen",
    "SOFMC Island Slice",
    "SOFMC ReMax Fan Deck",
    "SOFMC TacoTacoTaco",
  ],
  beer: [
    "SOFMC Phillips Bar",
    "SOFMC ReMax Fan Deck",
    "SOFMC Portable Stations",
    "SOFMC Island Slice",
    "SOFMC Island Canteen",
    "SOFMC TacoTacoTaco",
  ],
  drinks: [
    "SOFMC Phillips Bar",
    "SOFMC ReMax Fan Deck",
    "SOFMC Portable Stations",
    "SOFMC Island Slice",
    "SOFMC Island Canteen",
    "SOFMC TacoTacoTaco",
  ],
  snacks: [
    "SOFMC Phillips Bar",
    "SOFMC ReMax Fan Deck",
    "SOFMC Portable Stations",
    "SOFMC Island Slice",
    "SOFMC Island Canteen",
    "SOFMC TacoTacoTaco",
  ],
};

/** Returns data category strings for simulation filtering, or null for "all". */
export function getDataCategories(fan: FanCategory): Set<string> | null {
  if (fan === "all") return null;
  return new Set(CATEGORY_DATA_MAP[fan]);
}

/** Returns location IDs that serve this category, or null for "all". */
export function getActiveLocations(fan: FanCategory): Set<string> | null {
  if (fan === "all") return null;
  return new Set(CATEGORY_LOCATION_MAP[fan]);
}
