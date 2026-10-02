# ArenaPulse - Victoria Royals fan ordering app

Started as a hackathon queue-visualizer prototype; now being built out per
`royals-app-build-context-v3.md` into the real ordering app (live Square
menu + cart + checkout, 4 launch stands, seat delivery, staff open/close
control). **Read STATUS.md before touching this** — it tracks what's real,
what's stubbed, and what still needs live Square account access to verify.
`HANDOFF.md` covers moving hosting/repo/secrets off Luke's personal accounts.
`DEMO.md` is the run sheet + open decisions for demoing to the SOFMC team.
`PREFLIGHT.md` is the checklist for the first real (paid) test order, Sep 18 2026.

## Commands

```bash
npm run dev            # Dev server on localhost:3000 (runs on mock Square data by default — see .env.example)
npm run build          # Production build
npm run lint           # ESLint
npm run process-data   # CSV → JSON pipeline (needs /External folder with CSVs)
npm run sandbox:seed   # Seed Square SANDBOX locations/taxes/items from .env.sandbox (once)
npm run dev:sandbox    # Second dev server on :3001 against the sandbox (stop :3000 first)
```

## Architecture

Next.js 16 + React 19 + TypeScript + Tailwind v4. No test framework configured. Requires Node.js 18+.

```
src/app/page.tsx                  # Fan-facing home: heat map/list, category filter, simulation controls
src/app/staff/page.tsx            # Staff control surface — passcode-gated open/close + cutoff (section 6a)
src/app/api/stands/route.ts       # GET — live stand list (Square locations + ordering state)
src/app/api/menu/route.ts         # GET ?locationId= — live orderable menu for one stand
src/app/api/orders/route.ts       # POST — validates, creates the Square order, then pays it (card or promo)
src/app/api/orders/status/route.ts # GET ?ids= — live stage of the fan's orders (replaces SMS; polled by the tracker)
src/app/api/promo/route.ts        # GET ?code= — is the 100%-off test coupon valid (ORDER_PROMO_CODE)
src/app/api/health/route.ts       # GET — non-secret readiness flags (square/redis/payments/promo)
src/app/api/seat-config/route.ts  # GET — seat picker config (live Ordering Stations or fallback)
src/app/api/staff/status/route.ts # GET/POST — staff open/close + cutoff, passcode-gated
src/lib/square/                   # All Square API integration — see STATUS.md for real-vs-stub detail
  types.ts       # Narrow typed subset of the Square API this app touches
  client.ts      # Fetch wrapper (SQUARE_ACCESS_TOKEN / SQUARE_ENVIRONMENT)
  config.ts      # Stand slot config — NEVER hardcode a stand name, only its Square location ID
  locations.ts   # Live stand list, resolved to live display names
  catalog.ts     # Live menu read (Catalog API) — no hardcoded menus/prices anywhere
  tax.ts         # Tax breakdown + alcohol gating (Liquor Tax, not "Contains Alcohol")
  orders.ts      # Square order creation (fulfillment recipient/prep/address per Square docs) + cancel
  payments.ts    # CreatePayment for the order total; PayOrder for $0 (promo) orders
  promo.ts       # ORDER_PROMO_CODE validation — test-only 100% coupon
  orderStatus.ts # Fulfillment state -> Received/Preparing/Ready/Done; four-stand scoped BatchRetrieveOrders
  stations.ts    # Seat/row picker — live-read shape, unconfirmed API, see STATUS.md
  mock.ts        # Dev-only fallback data, used when SQUARE_ACCESS_TOKEN is unset
src/lib/staffState.ts             # Staff open/close + cutoff persistence (dev-only, see STATUS.md)
src/lib/trackedOrders.ts          # Fan's placed orders in localStorage + polling hook + ready vibrate/chime
src/components/OrderTracker.tsx   # Live tracker sheet (post-payment) + "Your order" bar on the home page
src/components/ArenaMap.tsx       # SVG arena with heat-mapped stands, driven by live Stand[] data
src/components/ConcessionList.tsx # List view of stands, same live data
src/components/OrderPanel.tsx     # Menu browse → cart → checkout for one stand; hands off to OrderTracker
src/components/CategoryFilter.tsx # Category filter chips (food, beer, drinks, snacks)
src/components/DemandTimeline.tsx # Demand timeline chart
src/components/ThemeToggle.tsx    # Light/dark theme toggle
src/lib/simulation.ts            # SimulationEngine class - time-based transaction replay with decay
src/lib/types.ts                 # Transaction, GameData, GameIndex, HeatState interfaces
src/lib/categories.ts            # FanCategory type and CSV category mapping (heat-map filter only)
src/lib/demandTimeline.ts        # "Best Time to Go" analysis from transaction data
scripts/process-data.ts          # CSV-to-JSON data pipeline (PapaParse)
public/data/games/               # 68 game JSON files + index.json
```

## Data Flow

**Heat map (carried forward from the prototype):** CSV files → `process-data.ts` → JSON in `public/data/games/` → fetched by page → `SimulationEngine` replays transactions → `ArenaMap` renders heat colors. Keyed to a launch stand via `Stand.heatmapKey` (see `getHeatmapKeyForSlot` in `square/config.ts`) — this is the *only* place the old CSV location-name strings are still used, and only to link historical data, never for display or ordering.

**Menu/ordering:** fan picks a stand → `/api/menu?locationId=` reads live from Square → cart → checkout tokenizes the card with Square's Web Payments SDK (or applies the promo code) → `/api/orders` re-validates everything server-side (price, availability, alcohol limits, ordering-open state, seat) → creates a Square order against that stand's location ID → pays it (CreatePayment, or PayOrder with no payments when the total is $0). Square only shows an order to staff once it is paid. The panel then becomes a live tracker that polls `/api/orders/status` until staff mark the order completed in Square. There is no SMS: the open page is the alert.

## Busyness (live, from Square orders)

- Busyness comes from **real Square order volume**, not the simulation:
  orders/min over a rolling 15 min, from `/api/busyness` (one SearchOrders call
  for all four stands per ~45s, cached). Only the four configured location IDs
  are ever queried — the token reaches 62.
- **It is self-relative per stand.** `heat = rate / that stand's own reference
  rate`, where the reference is its observed peak 15-min rate on a game night
  x 1.15. So heat answers "how busy is this stand compared to its own worst",
  not "which stand has the shortest line".
- **Consequence to know:** at intermission every stand sits near its own peak,
  so all four read "Very busy" at once. That is honest — they really are all
  slammed — but it means the map does not discriminate between stands at the
  busiest moment.
- **Cross-stand comparison needs till counts from Eventium.** Island Canteen
  sustains 7.2 orders/min and TacoTacoTaco 3.3, but a single-till stand at
  3.3/min can have a longer line than a four-till stand at 7.2. Normalising
  every stand against one shared scale would assert a comparison the data does
  not support. With tills per stand, `rate / tills` makes it defensible.
- **No wait estimate exists, deliberately.** This account gives no queue depth
  (POS fulfillments are born COMPLETED) and no prep times (created_at ->
  closed_at is the card payment, median 2.3s). Never reintroduce a minutes
  figure derived from heat — that is what the old `Math.round(heat * 15)` was.
- The simulation is kept for demos and gated on `NODE_ENV` alone. No query
  flag: anyone could add one to the live URL.

## Tax rules (do not re-implement)

- **Square prices every cart. This app calculates no tax, ever.** The checkout
  total comes from `POST /v2/orders/calculate` (`/api/quote`) and the created
  order from `POST /v2/orders` — both built by the same `buildOrderPayload()`
  in `square/orders.ts`, so a quoted total and the amount charged cannot drift.
- **Always send `pricing_options: { auto_apply_taxes: true }`.** Square does
  *not* apply catalog taxes to Orders-API orders by default: without it an
  order built from `catalog_object_id`s comes back with `tax 0` and an empty
  `taxes[]`, and the stand collects no GST/PST/Liquor Tax. Verified safe with
  the 100% promo discount — the order total still comes out $0.00.
- **Never send `order.taxes` alongside it.** Square applies both sets and the
  fan is taxed twice.
- **Catalog IDs only — never ad-hoc line items.** Under `auto_apply_taxes`,
  Square taxes an ad-hoc amount with every `CatalogTax` flagged
  `applies_to_custom_amounts`, which on this account is PST + GST + Liquor Tax
  on everything, snacks included. `square/cart.ts` rejects such lines with a 400.
- A failed `calculate` must **block the order**, not fall back to a local
  estimate. There is deliberately no local estimate left to fall back to.

## Key Patterns

- `SimulationEngine` stored in `useRef` — not React state. Must call `stop()` to cleanup `requestAnimationFrame`
- Heat uses exponential decay model: raw heat accumulates per transaction, decays by `decayFactor` every `decayIntervalMinutes`
- Heat values normalized 0–1 on every frame relative to current max — earlier locations can appear to cool down when new spikes occur
- SVG positions are hard-coded in a `viewBox="0 15 500 360"` coordinate system
- Concession `c.id` strings must match CSV location field exactly (e.g., "SOFMC Island Canteen")

## Styling

- Royals branding: gold `#c5a94e`, dark navy `#0a0a1a` / `#1a2744`
- Heat gradient: green (0.0) → yellow (0.35) → orange (0.65) → red (1.0)
- Path alias: `@/*` → `./src/*`

## Gotchas

- No test suite — changes must be verified manually
- `process-data` expects an `/External` directory with raw CSVs (not in repo)
- Time display has potential midnight edge case (`0 AM` instead of `12 AM`)
- Games sorted descending by date; default selection is most recent
