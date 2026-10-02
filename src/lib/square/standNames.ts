// TEMPORARY fan-facing stand name override.
//
// Eventium renamed the three concessions in Square to "SOFMC Concession 1/2/3",
// which means nothing to a fan looking for the taco stand. Until Eventium
// renames them back in Square (DEMO.md open ask #5), the fan-facing UI shows
// the arena's real names from this map.
//
// REMOVE THIS FILE once the Square location names are fixed. It is the only
// place in the app where a stand name is written down, and it is keyed by
// location ID — never by name — so a Square rename cannot silently match the
// wrong stand. An ID that is not listed falls through to Square's own name.
//
// Fan-facing only. Square order data, the payment note and the staff views all
// keep Square's live name so the app and the register never disagree.
const FAN_STAND_NAME_OVERRIDES: Record<string, string> = {
  "06KYFX4ZMH3XB": "Island Canteen", // Square: SOFMC Concession 1
  LARSXNSYK7Z6G: "Island Slice", // Square: SOFMC Concession 2
  L21YPQA79XH0J: "TacoTacoTaco", // Square: SOFMC Concession 3
  LZQZQS9G9XF1M: "ReMax Fan Deck", // Square: SOFMC ReMax Fan Deck
};

/** The name a fan should see for a stand. Falls back to Square's own name. */
export function fanStandName(locationId: string, squareName: string): string {
  return FAN_STAND_NAME_OVERRIDES[locationId] ?? squareName;
}
