// Shared cart resolution for /api/quote and /api/orders.
//
// Both routes MUST resolve a client cart the same way: the price a fan is
// quoted and the order they are charged for have to be built from identical
// lines. Anything the client sends is a reference only — item and variation
// IDs — and everything else is re-read from the live Square menu.

import { getMenu } from "./catalog";
import { CartLine } from "./tax";
import { SquareCatalogTax } from "./types";

const MAX_QTY = 20;

export interface CartLineInput {
  itemId: string;
  variationId: string;
  quantity: number;
}

export type CartResolution =
  | { ok: true; cartLines: CartLine[]; taxesById: Record<string, SquareCatalogTax> }
  | { ok: false; status: number; error: string };

export async function resolveCartLines(
  locationId: string,
  lines: CartLineInput[] | undefined
): Promise<CartResolution> {
  if (!lines?.length) {
    return { ok: false, status: 400, error: "Cart is empty." };
  }

  for (const line of lines) {
    // Every line must name a Square catalog variation. An ad-hoc line (a name
    // and a price, no catalog_object_id) is not merely untyped — under
    // pricing_options.auto_apply_taxes Square taxes ad-hoc amounts with every
    // CatalogTax flagged applies_to_custom_amounts, which on this account is
    // PST + GST + Liquor Tax applied to everything, snacks included.
    // A 400 (bad request), never an unhandled 500.
    if (typeof line?.itemId !== "string" || typeof line?.variationId !== "string" || !line.itemId || !line.variationId) {
      return { ok: false, status: 400, error: "Every line must reference a Square catalog item." };
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QTY) {
      return { ok: false, status: 400, error: "Invalid quantity." };
    }
  }

  const { items, taxesById } = await getMenu(locationId);
  const itemsById = new Map(items.map((i) => [i.id, i]));

  const cartLines: CartLine[] = [];
  for (const line of lines) {
    const item = itemsById.get(line.itemId);
    const variation = item?.variations.find((v) => v.id === line.variationId);
    if (!item || !variation || variation.soldOut || !item.onlineVisible) {
      return {
        ok: false,
        status: 409,
        error: `"${item?.name ?? line.itemId}" is no longer available.`,
      };
    }
    cartLines.push({ item, variation, quantity: line.quantity });
  }

  return { ok: true, cartLines, taxesById };
}
