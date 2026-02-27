// Realistic arena concession pricing (CAD)
// Prices aren't in the transaction data, so these are estimated from
// typical WHL arena pricing at Save-On-Foods Memorial Centre.

export interface MenuItem {
  name: string;
  category: string;
  price: number;
}

// Normalize item names that changed across seasons
const NAME_MAP: Record<string, string> = {
  "Dogs": "Hot Dog",
  "Draught Beer": "Draft Beer",
  "Wine by the Glass SOFMC": "Wine by the Glass",
  "Non-Alcoholic Beverages": "Other Beverages",
  "Paletas": "Churro",  // merged seasonal
  "TTT TEST": "",        // test data, skip
  "Extras": "",          // generic, skip
};

const PRICES: Record<string, number> = {
  // Food
  "Hot Dog": 6.50,
  "Burgers": 12.00,
  "Fries": 7.00,
  "Chicken Tenders": 10.00,
  "Pizza Slice": 7.50,
  "Tacos": 9.00,
  "Crispy Chicken Burger": 12.00,
  "Panini": 10.00,
  "Hot Pressed Sandwich": 10.00,
  "Sweet Potato Fries": 8.00,
  "Jalapeno Poppers": 8.50,
  "Walking Taco": 9.00,
  "COMBOS": 14.00,
  "Sides": 5.00,
  // Beer
  "Cans of Beer": 9.50,
  "Draft Beer": 10.00,
  // Wine/Cider
  "Cider & Coolers": 9.00,
  "Wine by the Glass": 9.50,
  // Liquor
  "Tequila Slushy": 12.00,
  "Coffee & Baileys": 10.00,
  "Boozy Coffee": 10.00,
  // NA Bev
  "Bottle Pop": 4.50,
  "Water": 4.00,
  "Hot Drinks": 4.00,
  "Other Beverages": 4.50,
  "Virgin Slushy": 6.00,
  // Snacks
  "Popcorn": 7.00,
  "Pretzel": 7.50,
  "Chips": 4.50,
  // Sweets
  "Candy": 4.00,
  "Churro": 6.00,
  "Cotton Candy": 5.00,
  "Cookies & Brownies": 4.50,
  "Gummies": 4.00,
};

/** Normalize an item name from the dataset. Returns empty string for items to skip. */
export function normalizeItemName(raw: string): string {
  if (raw in NAME_MAP) return NAME_MAP[raw];
  return raw;
}

export function getItemPrice(normalizedName: string): number {
  return PRICES[normalizedName] ?? 0;
}

export interface VendorMenuSummary {
  items: MenuItem[];
  totalSold: number;
}

/**
 * Build a menu for a vendor from the current game's transactions.
 * Groups by normalized item name, deduplicates, sorted by popularity.
 */
export function buildVendorMenu(
  transactions: { location: string; item: string; category: string; qty: number }[],
  locationId: string
): VendorMenuSummary {
  const counts: Record<string, { name: string; category: string; count: number }> = {};
  let totalSold = 0;

  for (const tx of transactions) {
    if (tx.location !== locationId) continue;
    if (tx.qty <= 0) continue; // skip refunds
    const name = normalizeItemName(tx.item);
    if (!name) continue;
    totalSold += tx.qty;
    if (!(name in counts)) {
      counts[name] = { name, category: tx.category, count: 0 };
    }
    counts[name].count += tx.qty;
  }

  const items = Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .map(c => ({
      name: c.name,
      category: c.category,
      price: getItemPrice(c.name),
    }));

  return { items, totalSold };
}

/** Estimate wait time in minutes based on normalized heat (0-1). */
export function estimateWaitMinutes(heat: number): number {
  // 0 heat = ~0 min, 1.0 heat = ~15 min (busiest stand at peak)
  return Math.round(heat * 15);
}
