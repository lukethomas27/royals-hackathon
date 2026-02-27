# ConcessionQ Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first Next.js app that shows a live heatmap of arena concession busyness by replaying historical transaction data.

**Architecture:** Client-side only Next.js app. A build-time Node script converts 14 CSV files into per-game-date JSON. The React app loads a game's JSON, replays transactions at 30x speed with 5-minute rolling decay, and renders an SVG arena schematic with color-coded concession nodes.

**Tech Stack:** Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, Papa Parse (CSV parsing), deployed to Vercel.

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, etc. (via create-next-app)

**Step 1: Initialize the project**

Run from the repo root:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
```

Note: Run from `C:\Users\Luke\Documents\GitHub\royals-hackathon`. Say yes to install in existing directory. This creates the Next.js scaffold with App Router, TypeScript, Tailwind, and ESLint.

**Step 2: Install CSV parsing dependency**

```bash
npm install papaparse
npm install -D @types/papaparse
```

**Step 3: Verify it runs**

```bash
npm run dev
```

Visit http://localhost:3000 - should see the Next.js welcome page.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with TypeScript and Tailwind"
```

---

### Task 2: Build CSV-to-JSON Data Pipeline

**Files:**
- Create: `scripts/process-data.ts`
- Create: `src/data/games/` (output directory for JSON files)

**Step 1: Create the data processing script**

Create `scripts/process-data.ts`:

```typescript
import fs from "fs";
import path from "path";
import Papa from "papaparse";

interface TransactionRow {
  Date: string;
  Time: string;
  Category: string;
  Item: string;
  Qty: string;
  "Price Point Name": string;
  Location: string;
}

interface Transaction {
  time: string; // "HH:MM:SS"
  location: string;
  qty: number;
  category: string;
  item: string;
}

interface GameData {
  date: string;
  transactions: Transaction[];
  locations: string[];
}

const EXTERNAL_DIR = path.join(__dirname, "..", "External");
const OUTPUT_DIR = path.join(__dirname, "..", "src", "data", "games");

function processAllCSVs(): Map<string, Transaction[]> {
  const allTransactions = new Map<string, Transaction[]>();

  const csvFiles = fs
    .readdirSync(EXTERNAL_DIR)
    .filter((f) => f.endsWith(".csv"));

  for (const file of csvFiles) {
    const content = fs.readFileSync(path.join(EXTERNAL_DIR, file), "utf-8");
    const parsed = Papa.parse<TransactionRow>(content, {
      header: true,
      skipEmptyLines: true,
    });

    for (const row of parsed.data) {
      if (!row.Date || !row.Time || !row.Location) continue;

      const date = row.Date;
      const tx: Transaction = {
        time: row.Time,
        location: row.Location,
        qty: parseInt(row.Qty, 10) || 1,
        category: row.Category,
        item: row.Item,
      };

      if (!allTransactions.has(date)) {
        allTransactions.set(date, []);
      }
      allTransactions.get(date)!.push(tx);
    }
  }

  return allTransactions;
}

function main() {
  console.log("Processing CSV files...");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const transactionsByDate = processAllCSVs();

  // Collect all unique locations across all games
  const allLocations = new Set<string>();

  const gameIndex: { date: string; transactionCount: number }[] = [];

  for (const [date, transactions] of transactionsByDate) {
    // Sort transactions chronologically
    transactions.sort((a, b) => a.time.localeCompare(b.time));

    // Collect locations
    const locations = [...new Set(transactions.map((t) => t.location))].sort();
    locations.forEach((l) => allLocations.add(l));

    const gameData: GameData = {
      date,
      transactions,
      locations,
    };

    const filename = `${date}.json`;
    fs.writeFileSync(
      path.join(OUTPUT_DIR, filename),
      JSON.stringify(gameData)
    );

    gameIndex.push({ date, transactionCount: transactions.length });
    console.log(`  ${date}: ${transactions.length} transactions`);
  }

  // Sort index by date descending (most recent first)
  gameIndex.sort((a, b) => b.date.localeCompare(a.date));

  // Write index file
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "index.json"),
    JSON.stringify({
      games: gameIndex,
      locations: [...allLocations].sort(),
    })
  );

  console.log(
    `\nDone! Processed ${gameIndex.length} game dates into ${OUTPUT_DIR}`
  );
}

main();
```

**Step 2: Add the npm script and run it**

Add to `package.json` scripts:
```json
"process-data": "npx tsx scripts/process-data.ts"
```

Install tsx:
```bash
npm install -D tsx
```

Run:
```bash
npm run process-data
```

Expected: Console output listing each game date and transaction count, JSON files created in `src/data/games/`.

**Step 3: Commit**

```bash
git add scripts/ src/data/games/ package.json package-lock.json
git commit -m "feat: add CSV-to-JSON data pipeline"
```

---

### Task 3: Build the Simulation Engine

**Files:**
- Create: `src/lib/simulation.ts`
- Create: `src/lib/types.ts`

**Step 1: Create shared types**

Create `src/lib/types.ts`:

```typescript
export interface Transaction {
  time: string;
  location: string;
  qty: number;
  category: string;
  item: string;
}

export interface GameData {
  date: string;
  transactions: Transaction[];
  locations: string[];
}

export interface GameIndex {
  games: { date: string; transactionCount: number }[];
  locations: string[];
}

export interface HeatState {
  [location: string]: number; // current heat value 0-1 (normalized)
}
```

**Step 2: Create the simulation engine**

Create `src/lib/simulation.ts`:

```typescript
import { Transaction, HeatState } from "./types";

export interface SimulationConfig {
  speedMultiplier: number; // e.g. 30 for 30x speed
  decayIntervalMinutes: number; // e.g. 5
  decayFactor: number; // e.g. 0.5 (50% decay)
}

export const DEFAULT_CONFIG: SimulationConfig = {
  speedMultiplier: 30,
  decayIntervalMinutes: 5,
  decayFactor: 0.5,
};

export class SimulationEngine {
  private transactions: Transaction[];
  private locations: string[];
  private config: SimulationConfig;
  private rawHeat: { [location: string]: number };
  private txIndex: number;
  private simStartTime: number; // real timestamp when sim started
  private gameStartSeconds: number; // game start time in seconds since midnight
  private gameEndSeconds: number;
  private lastDecaySimTime: number;
  private onUpdate: (heat: HeatState, simTime: string, progress: number) => void;
  private animFrameId: number | null;
  private running: boolean;

  constructor(
    transactions: Transaction[],
    locations: string[],
    config: SimulationConfig,
    onUpdate: (heat: HeatState, simTime: string, progress: number) => void
  ) {
    this.transactions = transactions;
    this.locations = locations;
    this.config = config;
    this.onUpdate = onUpdate;
    this.rawHeat = {};
    this.txIndex = 0;
    this.simStartTime = 0;
    this.gameStartSeconds = 0;
    this.gameEndSeconds = 0;
    this.lastDecaySimTime = 0;
    this.animFrameId = null;
    this.running = false;

    // Initialize heat to 0 for all locations
    for (const loc of locations) {
      this.rawHeat[loc] = 0;
    }
  }

  private timeToSeconds(time: string): number {
    const [h, m, s] = time.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  }

  private secondsToTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const hh = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? "PM" : "AM";
    return `${hh}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")} ${ampm}`;
  }

  private getNormalizedHeat(): HeatState {
    const maxHeat = Math.max(...Object.values(this.rawHeat), 1);
    const normalized: HeatState = {};
    for (const loc of this.locations) {
      normalized[loc] = this.rawHeat[loc] / maxHeat;
    }
    return normalized;
  }

  start() {
    if (this.transactions.length === 0) return;

    this.gameStartSeconds = this.timeToSeconds(this.transactions[0].time);
    this.gameEndSeconds = this.timeToSeconds(
      this.transactions[this.transactions.length - 1].time
    );
    this.simStartTime = Date.now();
    this.txIndex = 0;
    this.lastDecaySimTime = this.gameStartSeconds;
    this.running = true;

    // Reset heat
    for (const loc of this.locations) {
      this.rawHeat[loc] = 0;
    }

    this.tick();
  }

  stop() {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private tick() {
    if (!this.running) return;

    const realElapsed = (Date.now() - this.simStartTime) / 1000;
    const simElapsed = realElapsed * this.config.speedMultiplier;
    const currentSimSeconds = this.gameStartSeconds + simElapsed;

    // Check if simulation is complete
    if (currentSimSeconds > this.gameEndSeconds + 60) {
      this.running = false;
      const totalDuration = this.gameEndSeconds - this.gameStartSeconds;
      this.onUpdate(this.getNormalizedHeat(), this.secondsToTime(this.gameEndSeconds), 1);
      return;
    }

    // Process transactions up to current sim time
    while (
      this.txIndex < this.transactions.length &&
      this.timeToSeconds(this.transactions[this.txIndex].time) <=
        currentSimSeconds
    ) {
      const tx = this.transactions[this.txIndex];
      this.rawHeat[tx.location] = (this.rawHeat[tx.location] || 0) + tx.qty;
      this.txIndex++;
    }

    // Apply decay
    const decayIntervalSeconds = this.config.decayIntervalMinutes * 60;
    while (
      this.lastDecaySimTime + decayIntervalSeconds <=
      currentSimSeconds
    ) {
      this.lastDecaySimTime += decayIntervalSeconds;
      for (const loc of this.locations) {
        this.rawHeat[loc] *= 1 - this.config.decayFactor;
      }
    }

    // Calculate progress
    const totalDuration = this.gameEndSeconds - this.gameStartSeconds;
    const progress = Math.min(simElapsed / totalDuration, 1);

    // Notify
    this.onUpdate(
      this.getNormalizedHeat(),
      this.secondsToTime(Math.min(currentSimSeconds, this.gameEndSeconds)),
      progress
    );

    // Next frame
    this.animFrameId = requestAnimationFrame(() => this.tick());
  }
}
```

**Step 3: Commit**

```bash
git add src/lib/
git commit -m "feat: add simulation engine with decay model"
```

---

### Task 4: Build the SVG Arena Schematic Component

**Files:**
- Create: `src/components/ArenaMap.tsx`

**Step 1: Create the arena map component**

Create `src/components/ArenaMap.tsx`:

```tsx
"use client";

import { HeatState } from "@/lib/types";

interface ArenaMapProps {
  heatState: HeatState;
}

// Concession positions around the arena (x, y as percentages)
const CONCESSIONS: {
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
}[] = [
  {
    id: "SOFMC Island Canteen",
    label: "Island Canteen",
    shortLabel: "Canteen",
    x: 50,
    y: 85,
  },
  {
    id: "SOFMC Island Slice",
    label: "Island Slice",
    shortLabel: "Pizza",
    x: 25,
    y: 75,
  },
  {
    id: "SOFMC Portable Stations",
    label: "Portable Stations",
    shortLabel: "Portable",
    x: 80,
    y: 40,
  },
  {
    id: "SOFMC ReMax Fan Deck",
    label: "ReMax Fan Deck",
    shortLabel: "Fan Deck",
    x: 50,
    y: 12,
  },
  {
    id: "SOFMC Phillips Bar",
    label: "Phillips Bar",
    shortLabel: "Bar",
    x: 20,
    y: 40,
  },
  {
    id: "SOFMC TacoTacoTaco",
    label: "TacoTacoTaco",
    shortLabel: "Tacos",
    x: 75,
    y: 75,
  },
];

function heatToColor(heat: number): string {
  // 0 = green, 0.33 = yellow, 0.66 = orange, 1 = red
  if (heat < 0.33) {
    // Green to Yellow
    const t = heat / 0.33;
    return lerpColor("#22c55e", "#eab308", t);
  } else if (heat < 0.66) {
    // Yellow to Orange
    const t = (heat - 0.33) / 0.33;
    return lerpColor("#eab308", "#f97316", t);
  } else {
    // Orange to Red
    const t = (heat - 0.66) / 0.34;
    return lerpColor("#f97316", "#ef4444", t);
  }
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function heatToGlow(heat: number): number {
  return heat * 20; // glow radius scales with heat
}

export default function ArenaMap({ heatState }: ArenaMapProps) {
  return (
    <svg viewBox="0 0 400 400" className="w-full max-w-md mx-auto">
      {/* Arena outline */}
      <rect
        x="30"
        y="30"
        width="340"
        height="340"
        rx="30"
        ry="30"
        fill="#1a1a2e"
        stroke="#334155"
        strokeWidth="2"
      />

      {/* Ice rink */}
      <rect
        x="100"
        y="120"
        width="200"
        height="160"
        rx="40"
        ry="40"
        fill="#0f172a"
        stroke="#1e40af"
        strokeWidth="1.5"
      />
      {/* Center line */}
      <line
        x1="200"
        y1="120"
        x2="200"
        y2="280"
        stroke="#1e40af"
        strokeWidth="1"
        strokeDasharray="4,4"
      />
      {/* Center circle */}
      <circle
        cx="200"
        cy="200"
        r="20"
        fill="none"
        stroke="#1e40af"
        strokeWidth="1"
      />
      {/* Rink label */}
      <text
        x="200"
        y="205"
        textAnchor="middle"
        fill="#475569"
        fontSize="12"
        fontFamily="sans-serif"
      >
        ICE
      </text>

      {/* Concession nodes */}
      {CONCESSIONS.map((c) => {
        const heat = heatState[c.id] || 0;
        const color = heatToColor(heat);
        const glowRadius = heatToGlow(heat);
        const cx = (c.x / 100) * 340 + 30;
        const cy = (c.y / 100) * 340 + 30;

        return (
          <g key={c.id}>
            {/* Glow effect */}
            {glowRadius > 0 && (
              <circle
                cx={cx}
                cy={cy}
                r={25 + glowRadius}
                fill={color}
                opacity={0.15}
              />
            )}
            {/* Node background */}
            <circle
              cx={cx}
              cy={cy}
              r={25}
              fill={color}
              stroke="#fff"
              strokeWidth="2"
              opacity={0.9}
            />
            {/* Label */}
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontSize="8"
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              {c.shortLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/
git commit -m "feat: add SVG arena map component with heat coloring"
```

---

### Task 5: Build the Main Page

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/globals.css` (modify existing)

**Step 1: Update globals.css for dark theme**

Replace `src/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #0a0a1a;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, sans-serif;
}
```

**Step 2: Update layout.tsx**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConcessionQ - Victoria Royals",
  description: "Find the shortest concession line",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
```

**Step 3: Build the main page**

Replace `src/app/page.tsx` with:

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ArenaMap from "@/components/ArenaMap";
import {
  SimulationEngine,
  DEFAULT_CONFIG,
  SimulationConfig,
} from "@/lib/simulation";
import { GameData, GameIndex, HeatState } from "@/lib/types";

export default function Home() {
  const [gameIndex, setGameIndex] = useState<GameIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [heatState, setHeatState] = useState<HeatState>({});
  const [simTime, setSimTime] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const engineRef = useRef<SimulationEngine | null>(null);

  // Load game index
  useEffect(() => {
    fetch("/data/games/index.json")
      .then((r) => r.json())
      .then((data: GameIndex) => {
        setGameIndex(data);
        if (data.games.length > 0) {
          setSelectedDate(data.games[0].date);
        }
        // Initialize heat to 0
        const initial: HeatState = {};
        data.locations.forEach((loc) => (initial[loc] = 0));
        setHeatState(initial);
      });
  }, []);

  const handleUpdate = useCallback(
    (heat: HeatState, time: string, prog: number) => {
      setHeatState(heat);
      setSimTime(time);
      setProgress(prog);
      if (prog >= 1) {
        setIsRunning(false);
      }
    },
    []
  );

  const startSimulation = async () => {
    if (!selectedDate) return;

    // Stop existing simulation
    if (engineRef.current) {
      engineRef.current.stop();
    }

    // Load game data
    const response = await fetch(`/data/games/${selectedDate}.json`);
    const gameData: GameData = await response.json();

    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      speedMultiplier: 30,
    };

    const engine = new SimulationEngine(
      gameData.transactions,
      gameData.locations,
      config,
      handleUpdate
    );

    engineRef.current = engine;
    setIsRunning(true);
    engine.start();
  };

  const stopSimulation = () => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setIsRunning(false);
  };

  return (
    <div className="flex flex-col items-center px-4 py-6 max-w-md mx-auto">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-1 text-white">ConcessionQ</h1>
      <p className="text-sm text-slate-400 mb-6">
        Find the shortest line
      </p>

      {/* Arena Map */}
      <ArenaMap heatState={heatState} />

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4 mb-6">
        <span className="text-xs text-slate-400">Quiet</span>
        <div className="flex h-3 rounded-full overflow-hidden w-32">
          <div className="flex-1 bg-green-500" />
          <div className="flex-1 bg-yellow-500" />
          <div className="flex-1 bg-orange-500" />
          <div className="flex-1 bg-red-500" />
        </div>
        <span className="text-xs text-slate-400">Busy</span>
      </div>

      {/* Sim time display */}
      {simTime && (
        <div className="text-center mb-4">
          <p className="text-lg font-mono text-white">{simTime}</p>
          <div className="w-48 h-1.5 bg-slate-700 rounded-full mt-2">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="w-full space-y-3">
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 text-sm border border-slate-700"
          disabled={isRunning}
        >
          {gameIndex?.games.map((g) => (
            <option key={g.date} value={g.date}>
              {g.date} ({g.transactionCount} transactions)
            </option>
          ))}
        </select>

        <button
          onClick={isRunning ? stopSimulation : startSimulation}
          className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
            isRunning
              ? "bg-red-600 hover:bg-red-700"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isRunning ? "Stop Simulation" : "Start Simulation"}
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Copy processed game data to public folder**

The game JSON needs to be served as static files. Add a script or copy them:

Add to `package.json` scripts:
```json
"copy-data": "cp -r src/data/games public/data/games"
```

Or alternatively, update `process-data.ts` to output directly to `public/data/games/` instead of `src/data/games/`. Preferred approach: change OUTPUT_DIR in `scripts/process-data.ts` to:

```typescript
const OUTPUT_DIR = path.join(__dirname, "..", "public", "data", "games");
```

Then re-run:
```bash
npm run process-data
```

**Step 5: Verify it works**

```bash
npm run dev
```

Visit http://localhost:3000 on your phone or in Chrome DevTools mobile view. Select a game date, hit "Start Simulation", watch the heatmap shift colors.

**Step 6: Commit**

```bash
git add src/app/ public/data/
git commit -m "feat: add main page with game selector and simulation controls"
```

---

### Task 6: Polish the Mobile Experience

**Files:**
- Modify: `src/components/ArenaMap.tsx` (add animations)
- Modify: `src/app/page.tsx` (add Victoria Royals branding)
- Modify: `src/app/globals.css` (add pulse animation)

**Step 1: Add CSS pulse animation**

Add to `src/app/globals.css`:

```css
@keyframes pulse-glow {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.3; }
}

.animate-pulse-glow {
  animation: pulse-glow 2s ease-in-out infinite;
}
```

**Step 2: Update ArenaMap glow to use CSS animation**

In `ArenaMap.tsx`, update the glow circle to add `className="animate-pulse-glow"` when heat > 0.5:

```tsx
{glowRadius > 0 && (
  <circle
    cx={cx}
    cy={cy}
    r={25 + glowRadius}
    fill={color}
    opacity={0.15}
    className={heat > 0.5 ? "animate-pulse-glow" : ""}
  />
)}
```

**Step 3: Add Royals branding colors**

Update the page header area to use Royals navy/gold colors. The Victoria Royals colors are navy blue (#1a2744) and gold (#c5a94e). Incorporate into the header and UI elements as appropriate.

**Step 4: Verify on mobile**

Open Chrome DevTools, toggle device toolbar, select iPhone 12/13/14 viewport. The entire UI should fit without scrolling and be thumb-friendly.

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: polish mobile experience with animations and branding"
```

---

### Task 7: Deploy to Vercel

**Step 1: Ensure data is committed**

Make sure `public/data/games/` is committed and not gitignored.

Check `.gitignore` doesn't exclude public/data.

**Step 2: Deploy**

```bash
npx vercel --prod
```

Or push to GitHub and connect the repo to Vercel for automatic deploys.

**Step 3: Test the deployed URL**

Open the Vercel URL on your phone. Scan-test the QR code flow.

**Step 4: Generate QR code**

Generate a QR code pointing to the Vercel deployment URL for the jumbotron demo.

---

## Task Dependency Order

```
Task 1 (scaffold) → Task 2 (data pipeline) → Task 3 (sim engine) → Task 4 (arena map) → Task 5 (main page) → Task 6 (polish) → Task 7 (deploy)
```

All tasks are sequential. Each builds on the previous.

## Estimated Total: ~7 tasks, each 5-15 minutes
