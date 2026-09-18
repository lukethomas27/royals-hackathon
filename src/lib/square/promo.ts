// One server-side promo code that zeroes an order (100% ORDER discount).
// Added 2026-09-18 for the first supervised test orders at SOFMC so the
// order flows through Square as PAID without moving money. Anyone with the
// code eats free, so: set ORDER_PROMO_CODE only for the test window and
// delete it from Vercel afterwards. Unset = no promo path exists.

export function getPromoCode(): string | null {
  const raw = process.env.ORDER_PROMO_CODE?.trim();
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
