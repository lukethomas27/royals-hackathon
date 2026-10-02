/**
 * Replays a past game night through the live busyness formula so the output
 * can be sanity-checked against what a fan would have seen.
 *
 * Read-only: one SearchOrders query, scoped to the four launch stands. Creates
 * nothing. Run with:
 *   npx tsx --env-file=.env.local scripts/replay-busyness.ts [YYYY-MM-DD]
 */
import { heatFromRate, heatLabel, perTillReference, WINDOW_MINUTES } from "../src/lib/square/busyness";
import { tillsFor } from "../src/lib/square/tills";

const STANDS: Record<string, string> = {
  "06KYFX4ZMH3XB": "Concession 1",
  LARSXNSYK7Z6G: "Concession 2",
  L21YPQA79XH0J: "Concession 3",
  LZQZQS9G9XF1M: "Fan Deck Bar",
};
const IDS = Object.keys(STANDS);
const TZ = "America/Vancouver";

const headers = {
  "Square-Version": "2025-01-23",
  Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
};

async function searchAll(startAt: string, endAt: string) {
  const orders: { location_id: string; created_at: string }[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch("https://connect.squareup.com/v2/orders/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        location_ids: IDS,
        limit: 500,
        ...(cursor ? { cursor } : {}),
        query: {
          filter: {
            date_time_filter: { created_at: { start_at: startAt, end_at: endAt } },
            state_filter: { states: ["OPEN", "COMPLETED"] },
          },
          sort: { sort_field: "CREATED_AT", sort_order: "ASC" },
        },
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body.errors)}`);
    orders.push(...(body.orders ?? []));
    cursor = body.cursor;
  } while (cursor && orders.length < 10_000);
  return orders;
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

async function main() {
  const day = process.argv[2] ?? "2026-09-27";
  // Local evening of the night in question, in UTC.
  const start = `${day}T00:00:00Z`;
  const end = `${day}T08:00:00Z`;
  const orders = await searchAll(start, end);
  console.log(`${orders.length} orders, ${day} (window ${start} -> ${end})\n`);

  // The live route measures a rolling 15-minute window; here each bucket is
  // one such window, which is the same arithmetic the route performs.
  const bucketMs = WINDOW_MINUTES * 60_000;
  const buckets = new Map<number, Record<string, number>>();
  for (const o of orders) {
    const key = Math.floor(new Date(o.created_at).getTime() / bucketMs) * bucketMs;
    const row = buckets.get(key) ?? {};
    row[o.location_id] = (row[o.location_id] ?? 0) + 1;
    buckets.set(key, row);
  }

  const wanted = process.env.REPLAY_TIMES?.split(",") ?? ["17:45", "18:45"];
  console.log(`heat and label at ${wanted.join(" and ")} PT:\n`);
  for (const target of wanted) {
    const key = [...buckets.keys()].sort((a, b) => a - b).find((k) => hhmm(k) === target);
    if (key === undefined) {
      console.log(`   ${target} — no orders in this bucket\n`);
      continue;
    }
    console.log(`   ${hhmm(key)} PT`);
    for (const id of IDS) {
      const count = buckets.get(key)![id] ?? 0;
      const perMin = count / WINDOW_MINUTES;
      const heat = heatFromRate(perMin, tillsFor(id), perTillReference());
      const bar = "#".repeat(Math.round(heat * 20)).padEnd(20, ".");
      console.log(
        `      ${STANDS[id].padEnd(16)} ${bar} heat ${heat.toFixed(2).padStart(5)}  ${heatLabel(heat)}`
      );
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
