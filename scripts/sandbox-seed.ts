// One-time seed of Square's SANDBOX so the checkout can be exercised end to
// end without touching Eventium's production account. Creates two
// locations (pickup + fan deck), the three BC taxes, and a handful of items
// shaped like the live menu (incl. a 24oz beer for the limit-1 rule), then
// writes the sandbox location IDs into .env.sandbox. Safe to re-run.
//
//   npm run sandbox:seed
import { readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.sandbox";
const env: Record<string, string> = {};
for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}
const TOKEN = env.SQUARE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("Paste the SANDBOX access token into .env.sandbox first.");
const BASE = "https://connect.squareupsandbox.com";

async function sq<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Square-Version": "2025-01-23",
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

const ADDRESS = {
  address_line_1: "1925 Blanshard St",
  locality: "Victoria",
  administrative_district_level_1: "BC",
  postal_code: "V8T 4J2",
  country: "CA",
};
const PICKUP_NAME = "ArenaPulse Sandbox Concession";
const FANDECK_NAME = "ArenaPulse Sandbox Fan Deck";

interface Loc {
  id: string;
  name: string;
  status: string;
  currency?: string;
}

async function ensureLocation(name: string, existing: Loc[]): Promise<Loc> {
  const found = existing.find((l) => l.name === name && l.status === "ACTIVE");
  if (found) return found;
  const created = await sq<{ location: Loc }>("/v2/locations", {
    method: "POST",
    body: JSON.stringify({ location: { name, address: ADDRESS, description: "ArenaPulse sandbox test stand" } }),
  });
  return created.location;
}

async function main() {
  const { locations = [] } = await sq<{ locations?: Loc[] }>("/v2/locations");
  console.log(
    "sandbox locations:",
    locations.map((l) => `${l.name} (${l.id}, ${l.status}, ${l.currency ?? "?"})`).join("; ")
  );
  const pickup = await ensureLocation(PICKUP_NAME, locations);
  const fandeck = await ensureLocation(FANDECK_NAME, locations);
  const currency = pickup.currency ?? locations[0]?.currency ?? "CAD";
  console.log(`pickup=${pickup.id} fandeck=${fandeck.id} currency=${currency}`);

  // Already seeded? (idempotency guard on the item name)
  const probe = await sq<{ items?: { item_data?: { name?: string } }[] }>("/v2/catalog/search-catalog-items", {
    method: "POST",
    body: JSON.stringify({ text_filter: "Draft Beer", enabled_location_ids: [fandeck.id], limit: 5 }),
  });
  const seeded = (probe.items ?? []).some((i) => i.item_data?.name === "Draft Beer");

  if (!seeded) {
    const money = (amount: number) => ({ amount, currency });
    const tax = (id: string, name: string, pct: string) => ({
      type: "TAX",
      id,
      present_at_all_locations: true,
      tax_data: {
        name,
        calculation_phase: "TAX_SUBTOTAL_PHASE",
        inclusion_type: "ADDITIVE",
        percentage: pct,
        enabled: true,
        applies_to_custom_amounts: true,
      },
    });
    const variation = (id: string, itemId: string, name: string, cents: number) => ({
      type: "ITEM_VARIATION",
      id,
      present_at_all_locations: true,
      item_variation_data: { item_id: itemId, name, pricing_type: "FIXED_PRICING", price_money: money(cents) },
    });
    const item = (
      id: string,
      name: string,
      taxIds: string[],
      variations: ReturnType<typeof variation>[],
      reporting?: string
    ) => ({
      type: "ITEM",
      id,
      present_at_all_locations: true,
      item_data: {
        name,
        tax_ids: taxIds,
        ecom_visibility: "VISIBLE",
        variations,
        ...(reporting ? { reporting_category: { id: reporting } } : {}),
      },
    });
    const category = (id: string, name: string) => ({
      type: "CATEGORY",
      id,
      present_at_all_locations: true,
      category_data: { name },
    });

    const objects = [
      tax("#gst", "GST", "5.0"),
      tax("#pst", "PST", "7.0"),
      tax("#liquor", "Liquor Tax", "10.0"),
      category("#cat-food", "Food"),
      category("#cat-nabev", "NA Bev"),
      category("#cat-beer", "Beer"),
      category("#cat-liquor", "Liquor"),
      category("#cat-snacks", "Snacks"),
      item("#coffee", "Hot Drinks", ["#gst"], [variation("#coffee-c", "#coffee", "Coffee", 349), variation("#coffee-t", "#coffee", "Tea", 349)], "#cat-nabev"),
      item("#chips", "Chips", ["#gst", "#pst"], [variation("#chips-r", "#chips", "Regular", 301)], "#cat-snacks"),
      item("#burger", "Cheeseburger", ["#gst"], [variation("#burger-r", "#burger", "", 1199)], "#cat-food"),
      item("#boozy", "Boozy Coffee", ["#gst", "#liquor"], [variation("#boozy-s", "#boozy", "Single", 900), variation("#boozy-d", "#boozy", "Double", 1200)], "#cat-liquor"),
      item("#draft", "Draft Beer", ["#gst", "#liquor"], [variation("#draft-12", "#draft", "SP Lager 12oz", 849), variation("#draft-24", "#draft", "SP Lager 24oz", 1699)], "#cat-beer"),
    ];
    const res = await sq<{ objects?: { type: string; id: string }[] }>("/v2/catalog/batch-upsert", {
      method: "POST",
      body: JSON.stringify({ idempotency_key: `seed-${Date.now()}`, batches: [{ objects }] }),
    });
    console.log("catalog upserted:", (res.objects ?? []).map((o) => o.type).join(", "));
  } else {
    console.log("catalog already seeded, skipping");
  }

  let text = readFileSync(ENV_FILE, "utf8");
  const set = (k: string, v: string) => {
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : text.trimEnd() + `\n${k}=${v}\n`;
  };
  set("SQUARE_STAND_SLOT_1_LOCATION_ID", pickup.id);
  set("SQUARE_STAND_SLOT_4_LOCATION_ID", fandeck.id);
  set("SQUARE_INSEAT_SLOT", "4");
  if (!/^ORDER_PROMO_CODE=/m.test(text)) set("ORDER_PROMO_CODE", "ROYALS-TEST-0918");
  writeFileSync(ENV_FILE, text);
  console.log(`wrote slot IDs into ${ENV_FILE}. Next: npm run dev:sandbox (port 3001)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
