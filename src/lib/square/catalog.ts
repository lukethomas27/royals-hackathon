// Live menu reads. Per build doc section 4: "The menu is not a static
// import. It is a live read from Square." No hardcoded menus, no seeded
// price tables, no admin UI — this file is the entire "menu system."
//
// CONFIRMED against Square's public API docs:
//   - CatalogObject of type ITEM / ITEM_VARIATION / CATEGORY / TAX
//   - variation.item_variation_data.price_money
//   - variation.item_variation_data.location_overrides[].sold_out
//   - item.present_at_all_locations / present_at_location_ids / absent_at_location_ids
//
// Catalog field mapping, checked 2026-08-25 against Square's public API
// docs and developer forums, and on 2026-09-07 against Eventium's LIVE
// production catalog (see STATUS.md — Liquor Tax is named exactly that,
// ecom_visibility is in use, sold_out location overrides are in use):
//   - "Online" -> `ecom_visibility` ("VISIBLE" | "HIDDEN" | "UNAVAILABLE").
//     CONFIRMED real and documented (Square dev forum: "How do I update the
//     field ecom_visibility via the API" — it's read-only/computed from
//     Square Online site settings, which is exactly why it's the right
//     field to *read* here even though it can't be *written* via this API).
//   - "Self-serve" -> no field. CONFIRMED (not just unconfirmed) there is no
//     per-item Catalog API field for this anywhere in Square's public docs
//     (checked CatalogItem's full field list: available_online,
//     available_for_pickup, available_electronically, skip_modifier_screen,
//     etc. — none of these mean "self-serve/kiosk," they're shipping/
//     pickup/electronic *fulfillment* flags). Square's self-serve ordering
//     (Square Kiosk hardware, QR-code self-order) is a site/product-level
//     feature, not Catalog item data. selfServeEnabled staying defaulted
//     true is therefore not a guess needing five minutes of dashboard time
//     — it's the correct fallback until Square ships a real field, or until
//     someone confirms Eventium is using a different mechanism (e.g. item
//     visibility scoped to a specific Square Online site) that this app
//     would need bespoke handling for.

import { isSquareConfigured, squareRequest } from "./client";
import { mockCatalogForLocation, MOCK_TAXES } from "./mock";
import {
  SquareCatalogCategory,
  SquareCatalogItem,
  SquareCatalogItemVariation,
  SquareCatalogTax,
} from "./types";

interface RawCatalogObject {
  type: string;
  id: string;
  is_deleted?: boolean;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  absent_at_location_ids?: string[];
  item_data?: {
    name?: string;
    description?: string;
    description_plaintext?: string;
    is_archived?: boolean;
    /** Deprecated by Square, still populated on old items. Last-resort fallback only. */
    category_id?: string;
    /** Current multi-category model. Eventium items carry 1-7 of these. */
    categories?: { id: string; ordinal?: number }[];
    /** The single reporting category - the clean one for grouping a menu. */
    reporting_category?: { id: string; ordinal?: number };
    ecom_visibility?: string; // "VISIBLE" | "HIDDEN" | "UNAVAILABLE" | "UNINDEXED"
    tax_ids?: string[];
    // SearchCatalogItems embeds the full ITEM_VARIATION objects here.
    variations?: RawCatalogObject[];
  };
  item_variation_data?: {
    name?: string;
    item_id?: string;
    price_money?: { amount: number; currency: string };
    location_overrides?: { location_id: string; sold_out?: boolean }[];
  };
  category_data?: { name?: string };
  tax_data?: { name?: string; percentage?: string; enabled?: boolean };
}

interface SearchCatalogItemsResponse {
  items?: RawCatalogObject[];
  cursor?: string;
  errors?: { detail?: string }[];
}

interface BatchRetrieveResponse {
  objects?: RawCatalogObject[];
}

function presentAtLocation(obj: RawCatalogObject, locationId: string): boolean {
  if (obj.absent_at_location_ids?.includes(locationId)) return false;
  if (obj.present_at_all_locations) return true;
  return obj.present_at_location_ids?.includes(locationId) ?? false;
}

/**
 * Which category to group an item under. Verified against Eventium's live
 * catalog on 2026-09-07: items carry several `categories` (site-specific
 * ones like "TacoTacoTaco Online", "1. Beverages", duplicates), while
 * `reporting_category` is exactly one clean bucket per item (Food, Beer,
 * Liquor, NA Bev, NA Bev PST Exempt, Snacks, Sweets, Wine, Cider &
 * Coolers, Extras) - the same buckets Eventium's own Square Online site
 * shows fans. The deprecated `category_id` is empty on every live item but
 * is kept as a last resort.
 */
function pickCategoryId(item: NonNullable<RawCatalogObject["item_data"]>): string | null {
  return item.reporting_category?.id ?? item.categories?.[0]?.id ?? item.category_id ?? null;
}

/**
 * Live menu for one location.
 *
 * Verified 2026-09-07 against Eventium's production account: the shared
 * catalog has 1000+ objects (62 locations, 396 categories), so the previous
 * single unpaginated `/v2/catalog/search` call returned a near-empty menu.
 * `/v2/catalog/search-catalog-items` with `enabled_location_ids` is the
 * right read - it returns only the ~20 items enabled at that stand, with
 * their variations (and per-location `sold_out` overrides) embedded, in one
 * page. Categories and taxes are then resolved by ID in one batch call.
 */
async function fetchLiveCatalog(
  locationId: string
): Promise<{ items: SquareCatalogItem[]; taxesById: Record<string, SquareCatalogTax> }> {
  // 1. Items enabled at this location, paginated (100/page; one page in practice).
  const rawItems: RawCatalogObject[] = [];
  let cursor: string | undefined;
  do {
    const page = await squareRequest<SearchCatalogItemsResponse>("/v2/catalog/search-catalog-items", {
      method: "POST",
      body: JSON.stringify({
        enabled_location_ids: [locationId],
        limit: 100,
        ...(cursor ? { cursor } : {}),
      }),
    });
    rawItems.push(...(page.items ?? []));
    cursor = page.cursor;
  } while (cursor);

  const liveItems = rawItems.filter(
    (obj) =>
      obj.type === "ITEM" &&
      !obj.is_deleted &&
      obj.item_data &&
      !obj.item_data.is_archived &&
      presentAtLocation(obj, locationId)
  );

  // 2. Resolve the category + tax objects these items reference, by ID.
  const refIds = new Set<string>();
  for (const obj of liveItems) {
    const cat = pickCategoryId(obj.item_data!);
    if (cat) refIds.add(cat);
    for (const t of obj.item_data!.tax_ids ?? []) refIds.add(t);
  }

  const categories: Record<string, SquareCatalogCategory> = {};
  const taxesById: Record<string, SquareCatalogTax> = {};
  if (refIds.size > 0) {
    const batch = await squareRequest<BatchRetrieveResponse>("/v2/catalog/batch-retrieve", {
      method: "POST",
      body: JSON.stringify({ object_ids: Array.from(refIds), include_related_objects: false }),
    });
    for (const obj of batch.objects ?? []) {
      if (obj.type === "CATEGORY" && obj.category_data?.name) {
        categories[obj.id] = { id: obj.id, name: obj.category_data.name };
      }
      if (obj.type === "TAX" && obj.tax_data) {
        taxesById[obj.id] = {
          id: obj.id,
          name: obj.tax_data.name ?? "Tax",
          percentage: obj.tax_data.percentage ?? "0",
          enabled: obj.tax_data.enabled ?? true,
        };
      }
    }
  }

  // 3. Shape items + their variations (variations can be absent at a
  //    location independently of their parent item - filter those too).
  const items: SquareCatalogItem[] = [];
  for (const obj of liveItems) {
    const d = obj.item_data!;
    const categoryId = pickCategoryId(d);
    const variations: SquareCatalogItemVariation[] = [];
    for (const raw of d.variations ?? []) {
      const v = raw.item_variation_data;
      if (!v || raw.is_deleted || !presentAtLocation(raw, locationId)) continue;
      variations.push({
        id: raw.id,
        name: v.name ?? "Regular",
        priceMoney: v.price_money ? { amount: v.price_money.amount, currency: v.price_money.currency } : null,
        soldOut: v.location_overrides?.find((o) => o.location_id === locationId)?.sold_out ?? false,
        inventoryCount: null, // TODO: wire /v2/inventory/batch-retrieve-counts if precise counts are needed
      });
    }
    items.push({
      id: obj.id,
      name: d.name ?? "Unnamed item",
      description: d.description_plaintext ?? d.description ?? null,
      categoryId,
      categoryName: categoryId ? categories[categoryId]?.name ?? null : null,
      taxIds: d.tax_ids ?? [],
      // ecom_visibility: VISIBLE / UNAVAILABLE both seen live (Hot Dog,
      // Highballs, Cotton Candy are UNAVAILABLE at the launch stands).
      onlineVisible: (d.ecom_visibility ?? "VISIBLE") === "VISIBLE",
      // No Catalog API field for this exists - confirmed, see file header.
      selfServeEnabled: true,
      variations,
    });
  }

  return { items, taxesById };
}

export interface MenuResult {
  items: SquareCatalogItem[];
  taxesById: Record<string, SquareCatalogTax>;
  source: "live" | "mock";
}

/** Keep internal accounting labels out of the fan-facing menu. */
export function fanCategoryName(categoryName: string | null): string | null {
  if (!categoryName) return null;
  if (categoryName.trim().toLowerCase() === "na bev pst exempt") return "NA Bev";
  return categoryName;
}

/** The live menu for one stand, grouped implicitly by categoryName. */
export async function getMenu(locationId: string): Promise<MenuResult> {
  if (!isSquareConfigured()) {
    return {
      items: mockCatalogForLocation(locationId),
      taxesById: MOCK_TAXES,
      source: "mock",
    };
  }
  const { items, taxesById } = await fetchLiveCatalog(locationId);
  return { items, taxesById, source: "live" };
}

/** Items a fan can actually see and order right now. */
export function orderableItems(items: SquareCatalogItem[]): SquareCatalogItem[] {
  return items
    .filter((item) => item.onlineVisible)
    .map((item) => ({
      ...item,
      categoryName: fanCategoryName(item.categoryName),
      variations: item.variations.filter((v) => !v.soldOut),
    }))
    .filter((item) => item.variations.length > 0);
}

export function groupByCategory(items: SquareCatalogItem[]): Map<string, SquareCatalogItem[]> {
  const groups = new Map<string, SquareCatalogItem[]>();
  for (const item of items) {
    const key = item.categoryName ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}
