// DEV-ONLY mock data. Not sourced from a live Square account — this is a
// small hand-built subset that exercises the interesting cases called out
// in the build doc: a HIDDEN item, an item with self-serve off, GST-only,
// GST+PST, GST+Liquor Tax, and a 24oz alcoholic variation.
//
// This is here so the app is runnable and demonstrable before real Square
// credentials exist. It must never be mistaken for the real catalog — per
// the build doc, section 7's snapshot is "a reference snapshot for building
// against, not a fixture to ship," and the same is true of this file, only
// more so (this is a hand-picked subset, not even the full snapshot).
//
// Wired in: locations.ts / catalog.ts fall back to this only when
// SQUARE_ACCESS_TOKEN is unset (see isSquareConfigured() in client.ts).

import { SquareCatalogItem, SquareCatalogTax, SquareLocation } from "./types";

export const MOCK_LOCATION_IDS = ["LOC_MOCK_1", "LOC_MOCK_2", "LOC_MOCK_3", "LOC_MOCK_4"];

export const MOCK_LOCATIONS: SquareLocation[] = [
  { id: "LOC_MOCK_1", name: "Mock Pickup Stand A", status: "ACTIVE" },
  { id: "LOC_MOCK_2", name: "Mock Pickup Stand B", status: "ACTIVE" },
  { id: "LOC_MOCK_3", name: "Mock Pickup Stand C", status: "ACTIVE" },
  { id: "LOC_MOCK_4", name: "Mock In-Seat Stand", status: "ACTIVE" },
];

export const MOCK_TAXES: Record<string, SquareCatalogTax> = {
  TAX_GST: { id: "TAX_GST", name: "GST", percentage: "5.0", enabled: true },
  TAX_PST: { id: "TAX_PST", name: "PST", percentage: "7.0", enabled: true },
  TAX_LIQUOR: { id: "TAX_LIQUOR", name: "Liquor Tax", percentage: "10.0", enabled: true },
};

function money(cents: number) {
  return { amount: cents, currency: "CAD" };
}

/** Same mock menu served at every mock stand, for simplicity. */
export function mockCatalogForLocation(_locationId: string): SquareCatalogItem[] {
  return [
    {
      id: "ITEM_HOTDOG",
      name: "Hot Dog",
      description: null,
      categoryId: "CAT_HOTDOG",
      categoryName: "Hot Dog",
      taxIds: ["TAX_GST"],
      onlineVisible: false, // HIDDEN at all four stands per section 8
      selfServeEnabled: true,
      variations: [
        { id: "VAR_HOTDOG_REG", name: "Regular", priceMoney: money(749), soldOut: false, inventoryCount: null },
      ],
    },
    {
      id: "ITEM_BURGER",
      name: "Cheeseburger",
      description: null,
      categoryId: "CAT_BURGERS",
      categoryName: "Burgers",
      taxIds: ["TAX_GST"],
      onlineVisible: true,
      selfServeEnabled: false, // self-serve off per section 8
      variations: [
        { id: "VAR_BURGER_SINGLE", name: "Cheeseburger", priceMoney: money(1099), soldOut: false, inventoryCount: null },
      ],
    },
    {
      id: "ITEM_BOTTLE_POP",
      name: "Bottle Pop",
      description: null,
      categoryId: "CAT_NA_BEV",
      categoryName: "NA Bev",
      taxIds: ["TAX_GST", "TAX_PST"], // PST applies here, per section 5
      onlineVisible: true,
      selfServeEnabled: true,
      variations: [
        { id: "VAR_POP_PEPSI", name: "Pepsi", priceMoney: money(499), soldOut: false, inventoryCount: null },
        { id: "VAR_POP_DIET", name: "Diet Pepsi", priceMoney: money(499), soldOut: false, inventoryCount: null },
      ],
    },
    {
      id: "ITEM_WATER",
      name: "Water",
      description: null,
      categoryId: "CAT_NA_BEV_EXEMPT",
      categoryName: "NA Bev PST Exempt",
      taxIds: ["TAX_GST"], // PST-exempt per section 5
      onlineVisible: true,
      selfServeEnabled: true,
      variations: [
        { id: "VAR_WATER_AQUAFINA", name: "Aquafina", priceMoney: money(399), soldOut: false, inventoryCount: null },
      ],
    },
    {
      id: "ITEM_CANS_BEER",
      name: "Cans of Beer",
      description: null,
      categoryId: "CAT_BEER",
      categoryName: "Cans of Beer",
      // Contains Alcohol flag is deliberately omitted/unreliable here — gate
      // on TAX_LIQUOR only, per section 8.
      taxIds: ["TAX_GST", "TAX_LIQUOR"],
      onlineVisible: true,
      selfServeEnabled: true,
      variations: [
        { id: "VAR_BEER_BUD", name: "Budweiser", priceMoney: money(949), soldOut: false, inventoryCount: 24 },
      ],
    },
    {
      id: "ITEM_DRAFT_BEER",
      name: "Draft Beer",
      description: null,
      categoryId: "CAT_DRAFT",
      categoryName: "Draft Beer",
      taxIds: ["TAX_GST", "TAX_LIQUOR"],
      onlineVisible: true,
      selfServeEnabled: true,
      variations: [
        { id: "VAR_DRAFT_12OZ", name: "SP Lager 12oz", priceMoney: money(949), soldOut: false, inventoryCount: null },
        // 24oz variation — caps the order to 1 alcoholic item per section 6a.
        { id: "VAR_DRAFT_24OZ", name: "SP Lager 24oz", priceMoney: money(1899), soldOut: false, inventoryCount: null },
      ],
    },
    {
      id: "ITEM_SOLD_OUT_DEMO",
      name: "Poutine",
      description: null,
      categoryId: "CAT_FRIES",
      categoryName: "Fries",
      taxIds: ["TAX_GST"],
      onlineVisible: true,
      selfServeEnabled: true,
      variations: [
        // Demonstrates sold-out propagation (section 6a task #10 — "Test it").
        { id: "VAR_POUTINE", name: "Poutine", priceMoney: money(899), soldOut: true, inventoryCount: 0 },
      ],
    },
  ];
}
