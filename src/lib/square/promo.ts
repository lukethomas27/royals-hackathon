// One server-side promo code that zeroes an order (100% ORDER discount).
// Added 2026-09-18 for the first supervised test orders at SOFMC so the
// order flows through Square as PAID without moving money. Anyone with the
// code eats free, so: set ORDER_PROMO_CODE only for the test window and
// delete it from Vercel afterwards. Unset = no promo path exists.

let warned = false;

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

export function normalizePromoCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

export function isPromoCodeValid(code: string | null | undefined): boolean {
  const configured = getPromoCode();
  if (!configured) return false;
  const entered = normalizePromoCode(code);
  return entered.length > 0 && entered === configured.toUpperCase();
}
