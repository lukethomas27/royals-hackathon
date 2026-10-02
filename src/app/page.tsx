"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ArenaMap, { MapStand } from "@/components/ArenaMap";
import ConcessionList from "@/components/ConcessionList";
import CategoryFilter from "@/components/CategoryFilter";
import OrderPanel, { SquareClientConfig } from "@/components/OrderPanel";
import { ActiveOrdersBar, OrderTrackerSheet } from "@/components/OrderTracker";
import StandPicker from "@/components/StandPicker";
import BestTimeCard from "@/components/DemandTimeline";
import ThemeToggle from "@/components/ThemeToggle";
import {
  SimulationEngine,
  DEFAULT_CONFIG,
  SimulationConfig,
} from "@/lib/simulation";
import { GameData, GameIndex, HeatState, SimulationStats, Transaction } from "@/lib/types";
import { BusynessSnapshot, StandBusyness, MAX_AGE_MS } from "@/lib/square/busyness";
import { FanCategory, getDataCategories, getActiveLocations } from "@/lib/categories";
import { findBestTimes } from "@/lib/demandTimeline";
import { addTrackedOrder, dismissTrackedOrder, useTrackedOrders } from "@/lib/trackedOrders";

export default function Home() {
  const [stands, setStands] = useState<MapStand[]>([]);
  const [inSeatSection, setInSeatSection] = useState("108");
  const [squareConfig, setSquareConfig] = useState<SquareClientConfig | null>(null);
  const [gameIndex, setGameIndex] = useState<GameIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [heatState, setHeatState] = useState<HeatState>({});
  const [simTime, setSimTime] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [speed, setSpeed] = useState<number>(120);
  const [selectedCategory, setSelectedCategory] = useState<FanCategory>("all");
  const [selectedStandId, setSelectedStandId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Live order tracking (replaces SMS): polled here so it keeps running while
  // the fan browses with the tracker sheet closed.
  const trackedOrders = useTrackedOrders();
  const [trackerOrderId, setTrackerOrderId] = useState<string | null>(null);
  const trackerOrder = trackedOrders.find((o) => o.orderId === trackerOrderId) ?? null;
  const [txVersion, setTxVersion] = useState(0);
  // List is the default: a fan opening this at a game wants to see which
  // stands are open and what the lines look like, not an arena diagram. The
  // map is one tap away on the toggle below. (No persistence today — a
  // returning visitor also lands on List.)
  const [viewMode, setViewMode] = useState<"map" | "list">("list");
  const [busyness, setBusyness] = useState<BusynessSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The simulation is a demo tool, not a fan feature. Gated on NODE_ENV alone
  // — a query flag would let anyone switch it on against the live URL.
  const devTools = process.env.NODE_ENV !== "production";
  const engineRef = useRef<SimulationEngine | null>(null);
  const gameTransactions = useRef<Transaction[]>([]);

  const standHeatKeys = useMemo(
    () => stands.map((s) => s.heatmapKey).filter((k): k is string => k !== null),
    [stands]
  );

  const activeLocations = useMemo(
    () => getActiveLocations(selectedCategory, standHeatKeys),
    [selectedCategory, standHeatKeys]
  );

  const bestLocation = useMemo(() => {
    if (selectedCategory === "all") return null;
    const eligible = activeLocations;
    if (!eligible) return null;
    const entries = Object.entries(heatState).filter(([loc]) => eligible.has(loc));
    if (entries.length === 0) return null;
    const hasAnyHeat = entries.some(([, v]) => v > 0);
    if (!hasAnyHeat) return null;
    let minLoc = entries[0][0];
    let minVal = entries[0][1];
    for (const [loc, val] of entries) {
      if (val < minVal) {
        minLoc = loc;
        minVal = val;
      }
    }
    return minLoc;
  }, [heatState, selectedCategory, activeLocations]);

  const selectedStand = stands.find((s) => s.locationId === selectedStandId) ?? null;
  const openStandCount = stands.filter((s) => s.isOpen).length;
  const selectedStandHeat = selectedStand?.heatmapKey ? heatState[selectedStand.heatmapKey] || 0 : 0;

  // Compute best/worst times based on selected category or vendor
  const categoryFilter = useMemo(() => getDataCategories(selectedCategory), [selectedCategory]);
  const bestTimeResult = useMemo(
    () => findBestTimes(gameTransactions.current, {
      categories: categoryFilter,
      location: selectedStand?.heatmapKey ?? null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txVersion, selectedCategory, selectedStandId]
  );
  const bestTimeContext = selectedStand
    ? selectedStand.fanName ?? selectedStand.displayName
    : selectedCategory === "all"
      ? "any concession"
      : selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1);

  useEffect(() => {
    fetch("/api/stands")
      .then((r) => r.json())
      .then((data: { stands: MapStand[]; inSeatPhysicalSection: string; square?: SquareClientConfig }) => {
        setStands(data.stands);
        setInSeatSection(data.inSeatPhysicalSection);
        setSquareConfig(data.square ?? null);
      });

    fetch("/data/games/index.json")
      .then((r) => r.json())
      .then((data: GameIndex) => {
        setGameIndex(data);
        if (data.games.length > 0) {
          setSelectedDate(data.games[0].date);
          fetch(`/data/games/${data.games[0].date}.json`)
            .then((r) => r.json())
            .then((gd: GameData) => { gameTransactions.current = gd.transactions; setTxVersion((v) => v + 1); });
        }
        const initial: HeatState = {};
        data.locations.forEach((loc) => (initial[loc] = 0));
        setHeatState(initial);
      });
  }, []);

  // Live busyness. The route caches server-side, so this poll is cheap and
  // never turns into a Square call per page view.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/busyness")
        .then((r) => r.json())
        .then((data: BusynessSnapshot) => {
          if (!cancelled) setBusyness(data);
        })
        .catch(() => {
          if (!cancelled) setBusyness(null);
        });
    };
    load();
    const poll = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const busynessByLocation = useMemo(() => {
    const map: Record<string, StandBusyness> = {};
    const stale = busyness ? now - new Date(busyness.asOf).getTime() > MAX_AGE_MS : true;
    for (const s of busyness?.stands ?? []) {
      // Past MAX_AGE_MS we stop claiming it is live rather than showing a
      // colour that looks current.
      map[s.locationId] = stale && s.state === "live" ? { ...s, state: "unknown", heat: null, label: null } : s;
    }
    return map;
  }, [busyness, now]);

  const updatedAgoLabel = useMemo(() => {
    if (!busyness) return null;
    const mins = Math.floor((now - new Date(busyness.asOf).getTime()) / 60_000);
    if (mins < 1) return "updated just now";
    return `updated ${mins} min ago`;
  }, [busyness, now]);

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

  const handleCategoryChange = useCallback((cat: FanCategory) => {
    setSelectedCategory(cat);
    const filter = getDataCategories(cat);
    if (engineRef.current) {
      engineRef.current.setCategoryFilter(filter);
    }
  }, []);

  const startSimulation = async () => {
    if (!selectedDate) return;

    if (engineRef.current) {
      engineRef.current.stop();
    }

    const response = await fetch(`/data/games/${selectedDate}.json`);
    const gameData: GameData = await response.json();

    gameTransactions.current = gameData.transactions;
    setTxVersion((v) => v + 1);

    const config: SimulationConfig = {
      ...DEFAULT_CONFIG,
      speedMultiplier: speed,
    };

    const engine = new SimulationEngine(
      gameData.transactions,
      gameData.locations,
      config,
      handleUpdate
    );

    const filter = getDataCategories(selectedCategory);
    engine.setCategoryFilter(filter);

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
      <div className="flex items-start justify-between w-full mb-4">
        <div>
          <h1 className="text-2xl font-bold mb-0" style={{ color: "var(--accent-gold)" }}>
            ArenaPulse
          </h1>
          <p className="text-xs mb-0.5" style={{ color: "var(--accent-gold-dim)" }}>
            Victoria Royals
          </p>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Find the shortest line, then order
          </p>
        </div>
        <ThemeToggle />
      </div>

      <ActiveOrdersBar orders={trackedOrders} onOpen={setTrackerOrderId} />

      {/* The obvious way in. Tapping a stand on the map still opens its menu
          directly — this exists because the map alone was not discoverable. */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="order-cta w-full mb-4"
        disabled={stands.length === 0}
      >
        <span className="order-cta-main">Order food</span>
        <span className="order-cta-sub">
          {stands.length === 0
            ? "Loading stands…"
            : openStandCount > 0
              ? `${openStandCount} of ${stands.length} stands open now`
              : "See the menus — stands open on game day"}
        </span>
      </button>

      <CategoryFilter selected={selectedCategory} onChange={handleCategoryChange} />

      {/* View mode toggle */}
      <div className="flex w-full rounded-lg overflow-hidden mb-4" style={{ border: "1px solid var(--border-default)" }}>
        {(["map", "list"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className="flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: viewMode === mode ? "var(--btn-active-bg)" : "var(--btn-bg)",
              color: viewMode === mode ? "var(--btn-active-text)" : "var(--btn-text)",
            }}
          >
            {mode === "map" ? "Map" : "List"}
          </button>
        ))}
      </div>

      {updatedAgoLabel && (
        <p className="w-full text-[10px] mb-2 text-right" style={{ color: "var(--text-tertiary)" }}>
          Busyness from sales in the last 15 min · {updatedAgoLabel}
        </p>
      )}

      {viewMode === "map" ? (
        <>
          <ArenaMap
            stands={stands}
            heatState={heatState}
            busyness={busynessByLocation}
            activeLocations={activeLocations}
            bestLocation={bestLocation}
            onNodeClick={setSelectedStandId}
            stats={stats}
            inSeatSection={inSeatSection}
          />

          <div className="flex items-center gap-2 mt-4 mb-2">
            <span className="text-xs" style={{ color: "var(--legend-text)" }}>Quiet</span>
            <div
              className="h-3 rounded-full w-32"
              style={{ background: "linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)" }}
            />
            <span className="text-xs" style={{ color: "var(--legend-text)" }}>Busy</span>
          </div>
        </>
      ) : (
        <div className="w-full mb-4">
          <ConcessionList
            stands={stands}
            heatState={heatState}
            busyness={busynessByLocation}
            activeLocations={activeLocations}
            bestLocation={bestLocation}
            onNodeClick={setSelectedStandId}
            stats={stats}
            inSeatSection={inSeatSection}
          />
        </div>
      )}

      {bestTimeResult.bestTimes.length > 0 && (
        <BestTimeCard result={bestTimeResult} context={bestTimeContext} />
      )}

      {devTools && simTime && (
        <div className="text-center mb-4">
          <p className="text-lg font-mono" style={{ color: "var(--text-primary)" }}>{simTime}</p>
          <div className="w-48 h-1.5 rounded-full mt-2" style={{ backgroundColor: "var(--progress-bg)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: "var(--accent-gold)",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}

      {devTools && (
      <div className="w-full space-y-3">
        <select
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            fetch(`/data/games/${e.target.value}.json`)
              .then((r) => r.json())
              .then((gd: GameData) => { gameTransactions.current = gd.transactions; setTxVersion((v) => v + 1); });
          }}
          className="w-full rounded-lg px-4 py-3 text-sm border"
          style={{
            backgroundColor: "var(--bg-input)",
            color: "var(--text-primary)",
            borderColor: "var(--border-default)",
          }}
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
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Speed</span>
          <div className="flex gap-1">
            {[30, 60, 120, 240].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                disabled={isRunning}
                className="px-2.5 py-1 rounded text-xs font-mono"
                style={{
                  backgroundColor: speed === s ? "var(--btn-active-bg)" : "var(--btn-bg)",
                  color: speed === s ? "var(--btn-active-text)" : "var(--btn-text)",
                  borderWidth: 1,
                  borderColor: speed === s ? "var(--btn-active-border)" : "var(--btn-border)",
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
            backgroundColor: isRunning ? "#dc2626" : "var(--accent-gold)",
            color: isRunning ? "#fff" : "var(--text-inverted)",
          }}
        >
          {isRunning ? "Stop Simulation" : "Start Simulation"}
        </button>
      </div>
      )}

      {/* Order panel: live menu, cart and checkout for the selected stand */}
      {pickerOpen && (
        <StandPicker
          stands={stands}
          inSeatSection={inSeatSection}
          onPick={(locationId) => {
            setSelectedStandId(locationId);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {selectedStand && (
        <OrderPanel
          busyness={busynessByLocation[selectedStand.locationId] ?? null}
          stand={selectedStand}
          heat={selectedStandHeat}
          square={squareConfig}
          onClose={() => setSelectedStandId(null)}
          onOrderPlaced={(order) => {
            addTrackedOrder(order);
            setSelectedStandId(null);
            setTrackerOrderId(order.orderId);
          }}
        />
      )}

      {trackerOrder && (
        <OrderTrackerSheet
          order={trackerOrder}
          onClose={() => setTrackerOrderId(null)}
          onDismiss={() => {
            dismissTrackedOrder(trackerOrder.orderId);
            setTrackerOrderId(null);
          }}
        />
      )}
    </div>
  );
}
