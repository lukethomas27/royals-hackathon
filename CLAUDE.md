# ArenaPulse - Victoria Royals fan ordering app

Started as a hackathon queue-visualizer prototype; now being built out per
`royals-app-build-context-v3.md` into the real ordering app (live Square
menu + cart + checkout, 4 launch stands, seat delivery, staff open/close
control). **Read STATUS.md before touching this** — it tracks what's real,
what's stubbed, and what still needs live Square account access to verify.
`HANDOFF.md` covers moving hosting/repo/secrets off Luke's personal accounts.

## Commands

```bash
npm run dev            # Dev server on localhost:3000 (runs on mock Square data by default — see .env.example)
npm run build          # Production build
npm run lint           # ESLint
npm run process-data   # CSV → JSON pipeline (needs /External folder with CSVs)
```

## Architecture

Next.js 16 + React 19 + TypeScript + Tailwind v4. No test framework configured. Requires Node.js 18+.

```
src/app/page.tsx                  # Fan-facing home: heat map/list, category filter, simulation controls
src/app/staff/page.tsx            # Staff control surface — passcode-gated open/close + cutoff (section 6a)
src/app/api/stands/route.ts       # GET — live stand list (Square locations + ordering state)
src/app/api/menu/route.ts         # GET ?locationId= — live orderable menu for one stand
src/app/api/orders/route.ts       # POST — validates + creates a Square order
src/app/api/seat-config/route.ts  # GET — seat picker config (live Ordering Stations or fallback)
src/app/api/staff/status/route.ts # GET/POST — staff open/close + cutoff, passcode-gated
src/lib/square/                   # All Square API integration — see STATUS.md for real-vs-stub detail
  types.ts       # Narrow typed subset of the Square API this app touches
  client.ts      # Fetch wrapper (SQUARE_ACCESS_TOKEN / SQUARE_ENVIRONMENT)
  config.ts      # Stand slot config — NEVER hardcode a stand name, only its Square location ID
  locations.ts   # Live stand list, resolved to live display names
  catalog.ts     # Live menu read (Catalog API) — no hardcoded menus/prices anywhere
  tax.ts         # Tax breakdown + alcohol gating (Liquor Tax, not "Contains Alcohol")
  orders.ts      # Square order creation against the correct location ID
  stations.ts    # Seat/row picker — live-read shape, unconfirmed API, see STATUS.md
  mock.ts        # Dev-only fallback data, used when SQUARE_ACCESS_TOKEN is unset
src/lib/staffState.ts             # Staff open/close + cutoff persistence (dev-only, see STATUS.md)
src/components/ArenaMap.tsx       # SVG arena with heat-mapped stands, driven by live Stand[] data
src/components/ConcessionList.tsx # List view of stands, same live data
src/components/OrderPanel.tsx     # Menu browse → cart → checkout → confirmation for one stand
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

**Menu/ordering (new):** fan picks a stand → `/api/menu?locationId=` reads live from Square → cart → `/api/orders` re-validates everything server-side (price, availability, alcohol limits, ordering-open state) → creates a Square order against that stand's location ID.

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
