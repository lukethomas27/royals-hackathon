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
// docs and developer forums (no Eventium CSV/dashboard access available —
// see STATUS.md):
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
    category_id?: string;
    ecom_visibility?: string; // "VISIBLE" | "HIDDEN" | "UNAVAILABLE" | ...
    tax_ids?: string[];
    variations?: { id: string }[];
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

interface SearchCatalogResponse {
  objects?: RawCatalogObject[];
  related_objects?: RawCatalogObject[];
}

function presentAtLocation(obj: RawCatalogObject, locationId: string): boolean {
  if (obj.absent_at_location_ids?.includes(locationId)) return false;
  if (obj.present_at_all_locations) return true;
  return obj.present_at_location_ids?.includes(locationId) ?? false;
}

async function fetchLiveCatalog(
  locationId: string
): Promise<{ items: SquareCatalogItem[]; taxesById: Record<string, SquareCatalogTax> }> {
  const data = await squareRequest<SearchCatalogResponse>("/v2/catalog/search", {
    method: "POST",
    body: JSON.stringify({
      object_types: ["ITEM", "ITEM_VARIATION", "CATEGORY", "TAX"],
      include_related_objects: true,
    }),
  });

  const all = [...(data.objects ?? []), ...(data.related_objects ?? [])];

  const categories: Record<string, SquareCatalogCategory> = {};
  const taxesById: Record<string, SquareCatalogTax> = {};
  const variationsByItemId: Record<string, SquareCatalogItemVariation[]> = {};

  for (const obj of all) {
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

  for (const obj of all) {
    if (obj.type !== "ITEM_VARIATION" || !obj.item_variation_data) continue;
    const v = obj.item_variation_data;
    if (!v.item_id) continue;
    const soldOut =
      v.location_overrides?.find((o) => o.location_id === locationId)?.sold_out ?? false;
    const variation: SquareCatalogItemVariation = {
      id: obj.id,
      name: v.name ?? "Regular",
      priceMoney: v.price_money ? { amount: v.price_money.amount, currency: v.price_money.currency } : null,
      soldOut,
      inventoryCount: null, // TODO: wire /v2/inventory/batch-retrieve-counts if precise counts are needed
    };
    (variationsByItemId[v.item_id] ??= []).push(variation);
  }

  const items: SquareCatalogItem[] = [];
  for (const obj of all) {
    if (obj.type !== "ITEM" || obj.is_deleted || !obj.item_data) continue;
    if (!presentAtLocation(obj, locationId)) continue;

    const categoryId = obj.item_data.category_id ?? null;
    items.push({
      id: obj.id,
      name: obj.item_data.name ?? "Unnamed item",
      description: obj.item_data.description ?? null,
      categoryId,
      categoryName: categoryId ? categories[categoryId]?.name ?? null : null,
      taxIds: obj.item_data.tax_ids ?? [],
      // ecom_visibility mapping confirmed real, see file header.
      onlineVisible: (obj.item_data.ecom_visibility ?? "VISIBLE") === "VISIBLE",
      // No Catalog API field for this exists — confirmed, see file header.
      selfServeEnabled: true,
      variations: variationsByItemId[obj.id] ?? [],
    });
  }

  return { items, taxesById };
}

export interface MenuResult {
  items: SquareCatalogItem[];
  taxesById: Record<string, SquareCatalogTax>;
  source: "live" | "mock";
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
