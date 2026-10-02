// TEMPORARY fan-facing stand name override.
//
// Square's own location names carry an "SOFMC" prefix and have changed once
// already. Eventium asked for generic stand names while their branding is
// settled, so the fan-facing UI shows the names in this map.
//
// KEEP THIS FILE — the names are expected to change again. It is the only
// place in the app where a stand name is written down, and it is keyed by
// location ID, never by name, so a Square rename cannot silently match the
// wrong stand. An ID that is not listed falls through to Square's own name
// with the "SOFMC" prefix stripped, so that prefix never reaches a fan.
//
// Fan-facing only. Square order data, the payment note and the staff views all
// keep Square's live name so the app and the register never disagree.
const FAN_STAND_NAME_OVERRIDES: Record<string, string> = {
  "06KYFX4ZMH3XB": "Concession 1", // Square: SOFMC Concession 1
  LARSXNSYK7Z6G: "Concession 2", // Square: SOFMC Concession 2
  L21YPQA79XH0J: "Concession 3", // Square: SOFMC Concession 3
  LZQZQS9G9XF1M: "Fan Deck Bar", // Square: SOFMC ReMax Fan Deck
};

/** The name a fan should see for a stand. Falls back to Square's own name. */
export function fanStandName(locationId: string, squareName: string): string {
  const override = FAN_STAND_NAME_OVERRIDES[locationId];
  if (override) return override;
  // Unlisted stand: use Square's name, minus the venue prefix a fan does not
  // need to read on every row.
  return squareName.replace(/^SOFMC\s+/i, "").trim() || squareName;
}
