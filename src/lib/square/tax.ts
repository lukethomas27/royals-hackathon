// Tax + alcohol-gating rules, per build doc section 5 and section 8.
//
// Deliberately gates alcohol on the Liquor Tax assignment, never on
// Square's "Contains Alcohol" catalog flag — that flag is Y on only 4 of 8
// alcohol items (confirmed N on Boozy Coffee and both Tequila Slushies,
// blank on Cans of Beer). An app that trusted it would sell beer and
// spirits with no check.

import { SquareCatalogItem, SquareCatalogItemVariation, SquareCatalogTax } from "./types";

const LIQUOR_TAX_NAME_MATCH = /liquor/i;
const OZ_24_MATCH = /24\s*oz/i;

export function isLiquorTax(tax: SquareCatalogTax): boolean {
  return LIQUOR_TAX_NAME_MATCH.test(tax.name);
}

/** An item is alcoholic iff one of its assigned taxes is the Liquor Tax. */
export function isAlcoholicItem(
  item: SquareCatalogItem,
  taxesById: Record<string, SquareCatalogTax>
): boolean {
  return item.taxIds.some((id) => {
    const tax = taxesById[id];
    return tax ? isLiquorTax(tax) : false;
  });
}

/** A variation counts as the "1 24oz beverage" size limit case. */
export function is24ozVariation(variation: SquareCatalogItemVariation): boolean {
  return OZ_24_MATCH.test(variation.name);
}

export interface CartLine {
  item: SquareCatalogItem;
  variation: SquareCatalogItemVariation;
  quantity: number;
}

export interface AlcoholLimitResult {
  ok: boolean;
  reason?: string;
  requiresIdCheck: boolean;
  alcoholicQuantity: number;
  limit: number;
}

/**
 * Section 6a: "Maximum 2 alcoholic drinks per order, or 1 if the item is
 * 24oz." Same rule regardless of channel (phone ordering = till).
 */
export function validateAlcoholLimits(
  lines: CartLine[],
  taxesById: Record<string, SquareCatalogTax>
): AlcoholLimitResult {
  const alcoholicLines = lines.filter((l) => isAlcoholicItem(l.item, taxesById));

  if (alcoholicLines.length === 0) {
    return { ok: true, requiresIdCheck: false, alcoholicQuantity: 0, limit: 2 };
  }

  const hasAny24oz = alcoholicLines.some((l) => is24ozVariation(l.variation));
  const limit = hasAny24oz ? 1 : 2;
  const alcoholicQuantity = alcoholicLines.reduce((sum, l) => sum + l.quantity, 0);

  if (alcoholicQuantity > limit) {
    return {
      ok: false,
      reason:
        limit === 1
          ? "Orders with a 24oz alcoholic beverage are limited to 1 alcoholic item."
          : "Orders are limited to 2 alcoholic items.",
      requiresIdCheck: true,
      alcoholicQuantity,
      limit,
    };
  }

  return { ok: true, requiresIdCheck: true, alcoholicQuantity, limit };
}

export interface TaxBreakdown {
  gstCents: number;
  pstCents: number;
  liquorTaxCents: number;
  totalTaxCents: number;
}

/**
 * Sums the tax catalog objects attached to an item and applies them to a
 * line subtotal. We never reimplement Square's own tax calculation for a
 * real order (section 5: "do not reimplement tax... read it from Square") —
 * this is only used for the fan-facing cart preview total before Square's
 * Orders API computes the authoritative figure at order creation.
 */
export function estimateLineTax(
  item: SquareCatalogItem,
  subtotalCents: number,
  taxesById: Record<string, SquareCatalogTax>
): TaxBreakdown {
  let gstCents = 0;
  let pstCents = 0;
  let liquorTaxCents = 0;

  for (const taxId of item.taxIds) {
    const tax = taxesById[taxId];
    if (!tax || !tax.enabled) continue;
    const pct = Number(tax.percentage) / 100;
    const amount = Math.round(subtotalCents * pct);
    if (isLiquorTax(tax)) liquorTaxCents += amount;
    else if (/^pst$/i.test(tax.name)) pstCents += amount;
    else if (/^gst$/i.test(tax.name)) gstCents += amount;
    else gstCents += amount; // conservative default bucket
  }

  return {
    gstCents,
    pstCents,
    liquorTaxCents,
    totalTaxCents: gstCents + pstCents + liquorTaxCents,
  };
}
