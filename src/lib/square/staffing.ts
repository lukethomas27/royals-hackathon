// People working each stand on a game night — the serving capacity busyness
// divides order rate by.
//
// Staff set tonight's number per stand on /staff (stored with the stand's
// ordering state in staffState.ts). It sticks until someone changes it. The
// figures below are only the starting values, for a stand nobody has set yet.
//
// Starting values: Eventium, Matt Cooke, Oct 2 2026, given as ranges; the
// midpoint of each, except Concession 1 (see below). Luke confirmed on
// Oct 3 2026 that these are best read as PEOPLE working, not tills — 12 is
// Concession 1's headcount on a busy night — and headcount reflects output
// better, so that is what staff enter.
//
// Why it matters: busyness is comparable across stands only once order rate
// is divided by serving capacity. Concession 1 takes nearly double anyone
// else's orders at intermission, but with the most people, so per person it
// is the least pressed stand — the opposite of what raw order rate suggests.
//
// Staff-only. Headcounts appear on the passcode-gated staff route, never in a
// fan-facing API response.
import { MIN_STAFF, MAX_STAFF } from "../staffingLimits";

const DEFAULT_STAFF_BY_LOCATION: Record<string, number> = {
  // Concession 1 — Eventium: 8-12. Top of the range: on Oct 3 2026 it read
  // "Busy" sooner than the other stands for the line it actually had.
  "06KYFX4ZMH3XB": 12,
  LARSXNSYK7Z6G: 4.5, // Concession 2 — Eventium: 3-6
  L21YPQA79XH0J: 3.5, // Concession 3 — Eventium: 3-4
  LZQZQS9G9XF1M: 4.5, // Fan Deck Bar — Eventium: 3-6
};

/** Conservative stand-in for a stand Eventium has not given a count for. */
const FALLBACK_STAFF = 4;

export { MIN_STAFF, MAX_STAFF };

/** The starting value for a stand nobody has set on /staff. */
export function defaultStaffFor(locationId: string): number {
  return DEFAULT_STAFF_BY_LOCATION[locationId] ?? FALLBACK_STAFF;
}

/** People working tonight: what staff set, else the starting value. */
export function staffFor(locationId: string, setByStaff?: number | null): number {
  return setByStaff ?? defaultStaffFor(locationId);
}

export function isValidStaffCount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_STAFF && n <= MAX_STAFF;
}
