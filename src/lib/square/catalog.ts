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
// UNCONFIRMED against Eventium's live account (flagged inline, see
// STATUS.md): the exact field backing the dashboard's "Online" and
// "Self-serve" columns. Square's public Catalog API does not have a single
// universally-documented field named "self_serve" — this is very likely a
// per-site Square Online configuration rather than base Catalog data. We
// read the closest documented field (ecom_visibility) for "Online," and
// leave selfServeEnabled defaulted true with a location-override escape
// hatch until someone with dashboard access confirms where that flag
// actually lives.

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
      // Best-effort mapping — see the file header's UNCONFIRMED note.
      onlineVisible: (obj.item_data.ecom_visibility ?? "VISIBLE") === "VISIBLE",
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
