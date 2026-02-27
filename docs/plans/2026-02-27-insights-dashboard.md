# Actionable Insights Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate ConcessionQ from a heat-map visualization into an actionable business tool by adding live stats, a "shortest line" recommendation, a post-game summary, and a speed control slider.

**Architecture:** Extend the existing `SimulationEngine` callback to emit a `SimulationStats` object alongside the heat state. Add two new UI sections below the arena map (a "Go Here Now" banner and a stats grid). All data is derived from transactions already processed by the engine — no new data fetching or backend work. The page remains a single client component.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (existing stack). No new dependencies.

---

### Task 1: Add `SimulationStats` Type and Extend Engine Callback

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/simulation.ts`

**Step 1: Add the `SimulationStats` interface to types.ts**

Add after the `HeatState` interface in `src/lib/types.ts`:

```ts
export interface LocationStats {
  transactionCount: number;
  totalQty: number;
}

export interface SimulationStats {
  perLocation: { [location: string]: LocationStats };
  totalTransactions: number;
  quietestStand: string;
  busiestStand: string;
  peakStand: string;        // stand with highest all-time raw heat
  peakTime: string;         // sim time when peak occurred
  estimatedRevenue: number; // totalQty * AVG_PRICE
  isComplete: boolean;
}
```

**Step 2: Update `SimulationEngine` to track and emit stats**

In `src/lib/simulation.ts`:

a) Add new private fields after `private running: boolean;` (line ~27):

```ts
private locationStats: { [location: string]: LocationStats };
private peakHeat: number;
private peakStand: string;
private peakTime: string;
```

b) Update the `onUpdate` callback signature:

```ts
private onUpdate: (heat: HeatState, simTime: string, progress: number, stats: SimulationStats) => void;
```

And the constructor parameter to match.

c) Initialize new fields in constructor (after the `rawHeat` init loop):

```ts
this.locationStats = {};
this.peakHeat = 0;
this.peakStand = "";
this.peakTime = "";
for (const loc of locations) {
  this.locationStats[loc] = { transactionCount: 0, totalQty: 0 };
}
```

d) Reset them in `start()` (after the `rawHeat` reset loop):

```ts
for (const loc of this.locations) {
  this.locationStats[loc] = { transactionCount: 0, totalQty: 0 };
}
this.peakHeat = 0;
this.peakStand = "";
this.peakTime = "";
```

e) In `tick()`, update stats when processing transactions (inside the `while` loop, after `this.rawHeat[tx.location] = ...`):

```ts
this.locationStats[tx.location].transactionCount += 1;
this.locationStats[tx.location].totalQty += tx.qty;
```

f) In `tick()`, after the decay loop, track peak:

```ts
for (const loc of this.locations) {
  if (this.rawHeat[loc] > this.peakHeat) {
    this.peakHeat = this.rawHeat[loc];
    this.peakStand = loc;
    this.peakTime = this.secondsToTime(Math.min(currentSimSeconds, this.gameEndSeconds));
  }
}
```

g) Add a private method to build stats:

```ts
private getStats(isComplete: boolean): SimulationStats {
  const AVG_PRICE = 8;
  let totalTx = 0;
  let totalQty = 0;
  let minHeat = Infinity;
  let maxHeat = -Infinity;
  let quietest = this.locations[0];
  let busiest = this.locations[0];

  for (const loc of this.locations) {
    totalTx += this.locationStats[loc].transactionCount;
    totalQty += this.locationStats[loc].totalQty;
    const h = this.rawHeat[loc];
    if (h < minHeat) { minHeat = h; quietest = loc; }
    if (h > maxHeat) { maxHeat = h; busiest = loc; }
  }

  return {
    perLocation: { ...this.locationStats },
    totalTransactions: totalTx,
    quietestStand: quietest,
    busiestStand: busiest,
    peakStand: this.peakStand,
    peakTime: this.peakTime,
    estimatedRevenue: totalQty * AVG_PRICE,
    isComplete,
  };
}
```

h) Update both `onUpdate` calls in `tick()` to pass stats:

- End-of-game call: `this.onUpdate(this.getNormalizedHeat(), ..., 1, this.getStats(true));`
- Normal frame call: `this.onUpdate(this.getNormalizedHeat(), ..., progress, this.getStats(false));`

**Step 3: Commit**

```bash
git add src/lib/types.ts src/lib/simulation.ts
git commit -m "feat: extend SimulationEngine to emit per-location stats and peak tracking"
```

---

### Task 2: Update `page.tsx` to Consume Stats and Add Speed Control

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add state for stats and speed**

Add after existing `useState` declarations:

```ts
import { SimulationStats } from "@/lib/types";

const [stats, setStats] = useState<SimulationStats | null>(null);
const [speed, setSpeed] = useState<number>(120);
```

**Step 2: Update `handleUpdate` callback**

Change the callback to accept the new stats parameter:

```ts
const handleUpdate = useCallback(
  (heat: HeatState, time: string, prog: number, newStats: SimulationStats) => {
    setHeatState(heat);
    setSimTime(time);
    setProgress(prog);
    setStats(newStats);
    if (prog >= 1) {
      setIsRunning(false);
    }
  },
  []
);
```

**Step 3: Use `speed` state in `startSimulation`**

Replace the hardcoded `speedMultiplier: 120` with:

```ts
const config: SimulationConfig = {
  ...DEFAULT_CONFIG,
  speedMultiplier: speed,
};
```

**Step 4: Add speed control UI**

Replace the existing `<select>` and `<button>` section (the `<div className="w-full space-y-3">` block) with:

```tsx
<div className="w-full space-y-3">
  <select
    value={selectedDate}
    onChange={(e) => setSelectedDate(e.target.value)}
    className="w-full rounded-lg px-4 py-3 text-sm border"
    style={{ backgroundColor: "#1e293b", color: "#fff", borderColor: "#334155" }}
    disabled={isRunning}
  >
    {gameIndex?.games.map((g) => (
      <option key={g.date} value={g.date}>
        {g.date} ({g.transactionCount} transactions)
      </option>
    ))}
  </select>

  {/* Speed control */}
  <div className="flex items-center justify-between px-1">
    <span className="text-xs text-slate-400">Speed</span>
    <div className="flex gap-1">
      {[30, 60, 120, 240].map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          disabled={isRunning}
          className="px-2.5 py-1 rounded text-xs font-mono"
          style={{
            backgroundColor: speed === s ? "#c5a94e" : "#1e293b",
            color: speed === s ? "#1a2744" : "#94a3b8",
            borderWidth: 1,
            borderColor: speed === s ? "#c5a94e" : "#334155",
          }}
        >
          {s}x
        </button>
      ))}
    </div>
  </div>

  <button
    onClick={isRunning ? stopSimulation : startSimulation}
    className="w-full py-3 rounded-lg font-semibold"
    style={{
      backgroundColor: isRunning ? "#dc2626" : "#c5a94e",
      color: isRunning ? "#fff" : "#1a2744",
    }}
  >
    {isRunning ? "Stop Simulation" : "Start Simulation"}
  </button>
</div>
```

**Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add speed control and wire up SimulationStats state"
```

---

### Task 3: Add "Go Here Now" Recommendation Banner

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add the banner component inline**

Add this JSX after the heat legend `<div>` (the Quiet/Busy gradient bar) and before the `{simTime && (` block:

```tsx
{/* "Go Here Now" recommendation */}
{stats && (isRunning || stats.isComplete) && (
  <div
    className="w-full rounded-xl px-4 py-3 mb-4"
    style={{
      background: stats.isComplete
        ? "linear-gradient(135deg, #1a2744, #0f1c30)"
        : "linear-gradient(135deg, #14532d, #052e16)",
      border: `1px solid ${stats.isComplete ? "#334155" : "#22c55e40"}`,
    }}
  >
    <p className="text-xs font-semibold uppercase tracking-wider mb-1"
      style={{ color: stats.isComplete ? "#c5a94e" : "#4ade80" }}>
      {stats.isComplete ? "Game Summary" : "Shortest Line Right Now"}
    </p>
    <p className="text-lg font-bold text-white">
      {stats.isComplete
        ? `${stats.busiestStand.replace("SOFMC ", "")} was busiest`
        : stats.quietestStand.replace("SOFMC ", "")}
    </p>
    {!stats.isComplete && (
      <p className="text-xs text-slate-400 mt-0.5">
        {stats.perLocation[stats.quietestStand]?.transactionCount ?? 0} orders so far
      </p>
    )}
  </div>
)}
```

**Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add live 'shortest line' recommendation banner"
```

---

### Task 4: Add Stats Cards Grid

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add a helper to strip the "SOFMC " prefix**

Add at the top of the file (after imports):

```ts
const shortName = (s: string) => s.replace("SOFMC ", "");
```

**Step 2: Add the stats grid JSX**

Add after the "Go Here Now" banner block (and before the controls `<div className="w-full space-y-3">`):

```tsx
{/* Stats Grid */}
{stats && (isRunning || stats.isComplete) && (
  <div className="w-full grid grid-cols-3 gap-2 mb-4">
    {[
      {
        label: "Transactions",
        value: stats.totalTransactions.toLocaleString(),
      },
      {
        label: "Est. Revenue",
        value: `$${stats.estimatedRevenue.toLocaleString()}`,
      },
      {
        label: "Busiest",
        value: shortName(stats.busiestStand),
      },
      {
        label: "Quietest",
        value: shortName(stats.quietestStand),
      },
      {
        label: "Peak Stand",
        value: shortName(stats.peakStand || "—"),
      },
      {
        label: "Peak Time",
        value: stats.peakTime || "—",
      },
    ].map((card) => (
      <div
        key={card.label}
        className="rounded-lg px-2.5 py-2 text-center"
        style={{ backgroundColor: "#1e293b", border: "1px solid #334155" }}
      >
        <p className="text-xs text-slate-400 mb-0.5">{card.label}</p>
        <p className="text-sm font-semibold text-white truncate">{card.value}</p>
      </div>
    ))}
  </div>
)}
```

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add live stats cards grid with revenue, peak, and stand metrics"
```

---

### Task 5: Manual Verification and Final Polish

**Files:**
- None new — this is a testing/polish pass

**Step 1: Run the dev server**

```bash
npm run dev
```

**Step 2: Manual test checklist**

- [ ] Select a game and click Start Simulation
- [ ] Verify speed buttons work and are disabled during simulation
- [ ] Verify "Shortest Line Right Now" banner appears and updates live
- [ ] Verify stats grid shows and counts increment
- [ ] Verify banner switches to "Game Summary" when simulation completes
- [ ] Verify stats freeze with final values after completion
- [ ] Verify stopping mid-simulation clears the running state
- [ ] Try different speed settings (30x should be noticeably slow, 240x fast)

**Step 3: Fix the midnight edge case while we're here**

In `src/lib/simulation.ts`, `secondsToTime()` — change:

```ts
const hh = h > 12 ? h - 12 : h;
```

to:

```ts
const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
```

**Step 4: Run build to check for type errors**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: midnight display edge case in simulation time formatting"
```

---

## Summary of Changes

| Task | What | Impact |
|------|------|--------|
| 1 | Extend engine with `SimulationStats` | Foundation — all stats flow from here |
| 2 | Speed control + wire up stats state | UX control + plumbing |
| 3 | "Go Here Now" banner | Hero feature — fan & ops appeal |
| 4 | Stats cards grid | Business value — revenue, peak analysis |
| 5 | Manual verification + midnight fix | Polish + bug fix |

**Estimated effort:** ~2 hours for all 5 tasks.
