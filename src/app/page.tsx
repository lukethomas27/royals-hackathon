"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ArenaMap from "@/components/ArenaMap";
import ConcessionList from "@/components/ConcessionList";
import CategoryFilter from "@/components/CategoryFilter";
import VendorDetail from "@/components/VendorDetail";
import BestTimeCard from "@/components/DemandTimeline";
import ThemeToggle from "@/components/ThemeToggle";
import {
  SimulationEngine,
  DEFAULT_CONFIG,
  SimulationConfig,
} from "@/lib/simulation";
import { GameData, GameIndex, HeatState, SimulationStats, Transaction } from "@/lib/types";
import { FanCategory, getDataCategories, getActiveLocations } from "@/lib/categories";
import { buildVendorMenu, MenuItem } from "@/lib/vendorMenu";
import { findBestTimes } from "@/lib/demandTimeline";

// Lookup table for concession display names
const VENDOR_NAMES: Record<string, { label: string; shortLabel: string }> = {
  "SOFMC Phillips Bar":      { label: "Phillips Bar",      shortLabel: "Bar" },
  "SOFMC ReMax Fan Deck":    { label: "ReMax Fan Deck",    shortLabel: "Fan Deck" },
  "SOFMC Portable Stations": { label: "Portable Stations", shortLabel: "Portable" },
  "SOFMC Island Slice":      { label: "Island Slice",      shortLabel: "Pizza" },
  "SOFMC Island Canteen":    { label: "Island Canteen",    shortLabel: "Canteen" },
  "SOFMC TacoTacoTaco":      { label: "TacoTacoTaco",      shortLabel: "Tacos" },
};

export default function Home() {
  const [gameIndex, setGameIndex] = useState<GameIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [heatState, setHeatState] = useState<HeatState>({});
  const [simTime, setSimTime] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [speed, setSpeed] = useState<number>(120);
  const [selectedCategory, setSelectedCategory] = useState<FanCategory>("all");
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [txVersion, setTxVersion] = useState(0);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const engineRef = useRef<SimulationEngine | null>(null);
  const gameTransactions = useRef<Transaction[]>([]);

  const activeLocations = useMemo(
    () => getActiveLocations(selectedCategory),
    [selectedCategory]
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

  const vendorMenu = useMemo((): MenuItem[] => {
    if (!selectedVendor) return [];
    return buildVendorMenu(gameTransactions.current, selectedVendor).items;
  }, [selectedVendor]);

  // Compute best/worst times based on selected category or vendor
  const categoryFilter = useMemo(() => getDataCategories(selectedCategory), [selectedCategory]);
  const bestTimeResult = useMemo(
    () => findBestTimes(gameTransactions.current, {
      categories: categoryFilter,
      location: selectedVendor,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txVersion, selectedCategory, selectedVendor]
  );
  const bestTimeContext = selectedVendor && VENDOR_NAMES[selectedVendor]
    ? VENDOR_NAMES[selectedVendor].label
    : selectedCategory === "all"
      ? "any concession"
      : selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1);

  useEffect(() => {
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

    // Store transactions for vendor menu building and demand timeline
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
            Find the shortest line
          </p>
        </div>
        <ThemeToggle />
      </div>

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

      {viewMode === "map" ? (
        <>
          <ArenaMap
            heatState={heatState}
            activeLocations={activeLocations}
            bestLocation={bestLocation}
            onNodeClick={setSelectedVendor}
            stats={stats}
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
            heatState={heatState}
            activeLocations={activeLocations}
            bestLocation={bestLocation}
            onNodeClick={setSelectedVendor}
            stats={stats}
          />
        </div>
      )}

      {bestTimeResult.bestTimes.length > 0 && (
        <BestTimeCard result={bestTimeResult} context={bestTimeContext} />
      )}

      {simTime && (
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

      {/* Vendor detail panel */}
      {selectedVendor && VENDOR_NAMES[selectedVendor] && (
        <VendorDetail
          name={VENDOR_NAMES[selectedVendor].label}
          shortLabel={VENDOR_NAMES[selectedVendor].shortLabel}
          heat={heatState[selectedVendor] || 0}
          items={vendorMenu}
          onClose={() => setSelectedVendor(null)}
        />
      )}
    </div>
  );
}
