// Server-side promo codes. Two kinds, both env-driven, both optional:
//
// 1. ORDER_PROMO_CODE — zeroes an order (100% ORDER discount). Added
//    2026-09-18 for the first supervised test orders at SOFMC so the order
//    flows through Square as PAID without moving money. Anyone with the code
//    eats free, so: set it only for the test window and delete it from Vercel
//    afterwards.
// 2. ORDER_DISCOUNT_CODE — a partial percentage off (ORDER_DISCOUNT_PERCENT,
//    default 10). Added 2026-10-03. The fan still pays the rest by card.
//
// Unset = that promo path does not exist. Codes are case-insensitive. If both
// env vars hold the same code, the 100% code wins.
//
// The discount is applied by Square as an ORDER-scope percentage, before tax,
// via buildOrderPayload() — so /api/quote and /api/orders always agree and
// this file never computes money.

export interface Promo {
  /** Normalized (upper-case) code the fan entered. */
  code: string;
  /** Square discount percentage string, e.g. "100" or "10". */
  percentage: string;
  /** True when the discount zeroes the order: no card is asked for. */
  free: boolean;
}

const DEFAULT_DISCOUNT_PERCENT = "10";
// Square takes the percentage as a decimal string. Anything outside (0, 100)
// is refused: 100% has its own, deliberately separate, test-only variable.
const PERCENT_RE = /^\d{1,2}(\.\d{1,2})?$/;

let warned = false;
let warnedBadPercent = false;

export function getPromoCode(): string | null {
  const raw = process.env.ORDER_PROMO_CODE?.trim();
  if (raw && process.env.NODE_ENV !== "production" && !warned) {
    warned = true;
    // Loud on purpose. A promo code set outside a production build means this
    // machine can zero an order and mark it PAID — against whatever Square
    // account .env.local points at, which is currently the live one.
    console.warn(
      "\n" +
        "*************************************************************\n" +
        "*  ORDER_PROMO_CODE IS SET IN A NON-PRODUCTION ENVIRONMENT  *\n" +
        "*  Anyone with this code can place a $0 order that Square   *\n" +
        "*  marks PAID. If .env.local holds production credentials,  *\n" +
        "*  that is a real, free order at a real stand.              *\n" +
        "*  Unset ORDER_PROMO_CODE unless you are running a test.    *\n" +
        "*************************************************************\n"
    );
  }
  return raw ? raw : null;
}

/**
 * The partial-discount code and its percentage, or null when unset or
 * misconfigured. A bad ORDER_DISCOUNT_PERCENT disables the code (fails
 * closed) rather than guessing what was meant.
 */
export function getDiscountCode(): { code: string; percentage: string } | null {
  const code = process.env.ORDER_DISCOUNT_CODE?.trim();
  if (!code) return null;
  const percentage = process.env.ORDER_DISCOUNT_PERCENT?.trim() || DEFAULT_DISCOUNT_PERCENT;
  const n = Number(percentage);
  if (!PERCENT_RE.test(percentage) || !(n > 0 && n < 100)) {
    if (!warnedBadPercent) {
      warnedBadPercent = true;
      console.error(
        `[promo] ORDER_DISCOUNT_PERCENT="${percentage}" is not a percentage between 0 and 100 ` +
          `(e.g. "10" or "12.5"). ORDER_DISCOUNT_CODE is disabled until it is fixed.`
      );
    }
    return null;
  }
  return { code, percentage };
}

export function normalizePromoCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/** The promo a code unlocks, or null if it matches no configured code. */
export function resolvePromo(code: string | null | undefined): Promo | null {
  const entered = normalizePromoCode(code);
  if (!entered) return null;

  const full = getPromoCode();
  if (full && entered === full.toUpperCase()) {
    return { code: entered, percentage: "100", free: true };
  }
  const partial = getDiscountCode();
  if (partial && entered === partial.code.toUpperCase()) {
    return { code: entered, percentage: partial.percentage, free: false };
  }
  return null;
}

export function isPromoCodeValid(code: string | null | undefined): boolean {
  return resolvePromo(code) !== null;
}
