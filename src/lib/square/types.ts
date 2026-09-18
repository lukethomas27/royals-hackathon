// Minimal typed subset of the Square API surface this app touches.
// Deliberately narrow — we only model the fields we actually read or write.
// Source: https://developer.squareup.com/reference/square (Catalog, Locations, Orders, Payments)

export interface SquareMoney {
  amount: number; // minor units (cents)
  currency: string;
}

/** Postal address as Square's Locations API returns it (all optional). */
export interface SquareAddress {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  administrative_district_level_1?: string;
  postal_code?: string;
  country?: string;
}

export interface SquareLocation {
  id: string;
  name: string; // ALWAYS the live display name. Never cache/hardcode this.
  status: "ACTIVE" | "INACTIVE";
  address?: SquareAddress;
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
   * ordering surface for this location. Maps to Square's `ecom_visibility`
   * (VISIBLE / UNAVAILABLE both seen on Eventium's live catalog).
   */
  onlineVisible: boolean;
  /**
   * Self-serve flag. No Catalog API field exists for this (see catalog.ts
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
  /**
   * Square requires a recipient display name on every pickup/delivery
   * fulfillment (docs: "Manage Order Fulfillments"). We don't take accounts,
   * so this is the optional pickup name the fan typed, or "Fan ····1234".
   */
  recipientName: string;
  /**
   * DELIVERY fulfillments require a recipient address. In-seat delivery
   * never leaves the building, so this is the stand's own Square location
   * address; the seat itself travels in the fulfillment note.
   */
  standAddress?: SquareAddress | null;
  /**
   * When set, a 100% ORDER-scope discount with this label is attached, so
   * the order total is $0 and it can be marked paid with no card. Only ever
   * set after the server has validated the promo code (see promo.ts).
   */
  fullDiscountName?: string | null;
}

export interface SquareCreateOrderResult {
  orderId: string;
  locationId: string;
  totalMoney: SquareMoney;
  version: number;
  fulfillmentUid: string | null;
}

export interface SquarePaymentResult {
  paymentId: string;
  status: string; // COMPLETED / APPROVED / ...
  amount: SquareMoney;
  receiptUrl: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
}
