// Minimal typed subset of the Square API surface this app touches.
// Deliberately narrow — we only model the fields we actually read or write.
// Source: https://developer.squareup.com/reference/square (Catalog, Locations, Orders)

export interface SquareMoney {
  amount: number; // minor units (cents)
  currency: string;
}

export interface SquareLocation {
  id: string;
  name: string; // ALWAYS the live display name. Never cache/hardcode this.
  status: "ACTIVE" | "INACTIVE";
  address?: {
    address_line_1?: string;
    locality?: string;
  };
}

export interface SquareCatalogTax {
  id: string;
  name: string;
  percentage: string; // e.g. "10.0"
  enabled: boolean;
}

export interface SquareCatalogItemVariation {
  id: string;
  name: string; // e.g. "Double", "24oz", "Margarita"
  priceMoney: SquareMoney | null; // null => variable pricing
  soldOut: boolean;
  inventoryCount: number | null; // null = not tracked
}

export interface SquareCatalogCategory {
  id: string;
  name: string;
}

export interface SquareCatalogItem {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  variations: SquareCatalogItemVariation[];
  taxIds: string[];
  /**
   * Whether Square is currently presenting this item at all on the online
   * ordering surface for this location. This is the field we gate "can a fan
   * see it at all" on.
   *
   * Maps to Square's `ecom_visibility` field, confirmed real and documented
   * (see catalog.ts file header) — not yet checked against Eventium's
   * actual CSV/dashboard since neither was available in this session.
   */
  onlineVisible: boolean;
  /**
   * Whether self-serve (kiosk/self-checkout) ordering is enabled for this
   * item. Per the build doc this is a *separate* flag from onlineVisible —
   * fifteen items have this off while still being online-orderable.
   * CONFIRMED there is no Catalog API field for this (see catalog.ts file
   * header) — always true here is the correct fallback, not a guess.
   */
  selfServeEnabled: boolean;
}

export interface SquareOrderLineItemInput {
  catalogObjectId: string; // the variation id
  quantity: string; // Square wants this as a string
  note?: string;
}

export interface SquareCreateOrderRequest {
  locationId: string;
  lineItems: SquareOrderLineItemInput[];
  note?: string; // used for the ID-check flag and fulfillment context
  fulfillmentType: "PICKUP" | "DELIVERY";
  seat?: { section: string; row: string; seat: string } | null;
  customerPhone: string;
}

export interface SquareCreateOrderResult {
  orderId: string;
  locationId: string;
  totalMoney: SquareMoney;
}
