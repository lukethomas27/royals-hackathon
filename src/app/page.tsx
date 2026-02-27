"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ArenaMap from "@/components/ArenaMap";
import CategoryFilter from "@/components/CategoryFilter";
import VendorDetail from "@/components/VendorDetail";
import BestTimeCard from "@/components/DemandTimeline";
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
  const engineRef = useRef<SimulationEngine | null>(null);
  const gameTransactions = useRef<Transaction[]>([]);

  // Which locations serve the selected category (null = all)
  const activeLocations = useMemo(
    () => getActiveLocations(selectedCategory),
    [selectedCategory]
  );

  // Find the location with the lowest heat among those that serve the category
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

  // Build menu for the selected vendor from game data
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
          // Pre-load the most recent game's transactions for vendor menus
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

    // Apply current category filter to the new engine
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
      <h1 className="text-2xl font-bold mb-0" style={{ color: "#c5a94e" }}>ConcessionQ</h1>
      <p className="text-xs mb-1" style={{ color: "#8b7a3e" }}>Victoria Royals</p>
      <p className="text-sm text-slate-400 mb-4">Find the shortest line</p>

      <CategoryFilter selected={selectedCategory} onChange={handleCategoryChange} />

      <ArenaMap
        heatState={heatState}
        activeLocations={activeLocations}
        bestLocation={bestLocation}
        onNodeClick={setSelectedVendor}
      />

      <div className="flex items-center gap-2 mt-4 mb-2">
        <span className="text-xs text-slate-400">Quiet</span>
        <div
          className="h-3 rounded-full w-32"
          style={{ background: "linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)" }}
        />
        <span className="text-xs text-slate-400">Busy</span>
      </div>

      {bestTimeResult.bestTimes.length > 0 && (
        <BestTimeCard result={bestTimeResult} context={bestTimeContext} />
      )}

      {simTime && (
        <div className="text-center mb-4">
          <p className="text-lg font-mono text-white">{simTime}</p>
          <div className="w-48 h-1.5 bg-slate-700 rounded-full mt-2">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${progress * 100}%`, transition: "width 0.3s" }}
            />
          </div>
        </div>
      )}

      <div className="w-full space-y-3">
        <select
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            // Load transactions for the new game so vendor menus are accurate
            fetch(`/data/games/${e.target.value}.json`)
              .then((r) => r.json())
              .then((gd: GameData) => { gameTransactions.current = gd.transactions; setTxVersion((v) => v + 1); });
          }}
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
          style={{ backgroundColor: isRunning ? "#dc2626" : "#c5a94e", color: isRunning ? "#fff" : "#1a2744" }}
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
