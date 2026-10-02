// Tills (serving positions) per stand on a game night.
//
// Source: Eventium, Matt Cooke, Oct 2 2026. Stated as ranges; we use the
// midpoint of each. These are Eventium's game-night ESTIMATES, not a live
// feed — actual staffing varies game to game. If Eventium ever reports the
// tills they ran for a specific night, THIS FILE is the one place to change.
//
// Why it matters: busyness is comparable across stands only once order rate
// is divided by serving capacity. Concession 1 takes nearly double anyone
// else's orders at intermission, but across the most tills, so per till it is
// the least pressed stand — the opposite of what raw order rate suggests.
//
// Server-side only. Till counts are never exposed in an API response.
const TILLS_BY_LOCATION: Record<string, number> = {
  "06KYFX4ZMH3XB": 10, // Concession 1 — Eventium: 8-12
  LARSXNSYK7Z6G: 4.5, // Concession 2 — Eventium: 3-6
  L21YPQA79XH0J: 3.5, // Concession 3 — Eventium: 3-4
  LZQZQS9G9XF1M: 4.5, // Fan Deck Bar — Eventium: 3-6
};

/** Conservative stand-in for a stand Eventium has not given a count for. */
const DEFAULT_TILLS = 4;

export function tillsFor(locationId: string): number {
  return TILLS_BY_LOCATION[locationId] ?? DEFAULT_TILLS;
}
