"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ArenaMap from "@/components/ArenaMap";
import {
  SimulationEngine,
  DEFAULT_CONFIG,
  SimulationConfig,
} from "@/lib/simulation";
import { GameData, GameIndex, HeatState, SimulationStats } from "@/lib/types";

export default function Home() {
  const [gameIndex, setGameIndex] = useState<GameIndex | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [heatState, setHeatState] = useState<HeatState>({});
  const [simTime, setSimTime] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [speed, setSpeed] = useState<number>(120);
  const engineRef = useRef<SimulationEngine | null>(null);

  useEffect(() => {
    fetch("/data/games/index.json")
      .then((r) => r.json())
      .then((data: GameIndex) => {
        setGameIndex(data);
        if (data.games.length > 0) {
          setSelectedDate(data.games[0].date);
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

  const startSimulation = async () => {
    if (!selectedDate) return;

    if (engineRef.current) {
      engineRef.current.stop();
    }

    const response = await fetch(`/data/games/${selectedDate}.json`);
    const gameData: GameData = await response.json();

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
      <p className="text-sm text-slate-400 mb-6">Find the shortest line</p>

      <ArenaMap heatState={heatState} />

      <div className="flex items-center gap-2 mt-4 mb-6">
        <span className="text-xs text-slate-400">Quiet</span>
        <div
          className="h-3 rounded-full w-32"
          style={{ background: "linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)" }}
        />
        <span className="text-xs text-slate-400">Busy</span>
      </div>

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
          style={{ backgroundColor: isRunning ? "#dc2626" : "#c5a94e", color: isRunning ? "#fff" : "#1a2744" }}
        >
          {isRunning ? "Stop Simulation" : "Start Simulation"}
        </button>
      </div>
    </div>
  );
}
