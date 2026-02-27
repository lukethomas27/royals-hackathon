# ArenaPulse - Victoria Royals Arena Queue Visualizer

## Commands

```bash
npm run dev            # Dev server on localhost:3000
npm run build          # Production build
npm run lint           # ESLint
npm run process-data   # CSV → JSON pipeline (needs /External folder with CSVs)
```

## Architecture

Next.js 16 + React 19 + TypeScript + Tailwind v4. No test framework configured.

```
src/app/page.tsx           # Main client component - game selector, simulation controls
src/components/ArenaMap.tsx # SVG arena with heat-mapped concession stands
src/lib/simulation.ts      # SimulationEngine class - time-based transaction replay with decay
src/lib/types.ts           # Transaction, GameData, GameIndex, HeatState interfaces
scripts/process-data.ts    # CSV-to-JSON data pipeline (PapaParse)
public/data/games/         # 73 game JSON files + index.json
```

## Data Flow

CSV files → `process-data.ts` → JSON in `public/data/games/` → fetched by page → `SimulationEngine` replays transactions → `ArenaMap` renders heat colors

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
