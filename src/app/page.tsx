"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ArenaMap, { MapStand } from "@/components/ArenaMap";
import CategoryFilter from "@/components/CategoryFilter";
import OrderPanel, { SquareClientConfig } from "@/components/OrderPanel";
import StandCard from "@/components/StandCard";
import { CartLine } from "@/lib/square/tax";
import BestTimeCard from "@/components/DemandTimeline";
import {
  SimulationEngine,
  DEFAULT_CONFIG,
  SimulationConfig,
} from "@/lib/simulation";
import { GameData, GameIndex, HeatState, SimulationStats, Transaction } from "@/lib/types";
import { BusynessSnapshot, StandBusyness, MAX_AGE_MS } from "@/lib/square/busyness";
import { FanCategory, getDataCategories, getActiveLocations } from "@/lib/categories";
import { findBestTimes } from "@/lib/demandTimeline";

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
  // The cart lives here, not inside OrderPanel, so the sticky bar can show it
  // from the home screen. An order can only ever go to one Square location, so
  // there is one cart at a time and it remembers which stand it belongs to.
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLocationId, setCartLocationId] = useState<string | null>(null);
  const [pendingStandId, setPendingStandId] = useState<string | null>(null);
  const standsRef = useRef<HTMLDivElement | null>(null);
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
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const cartSubtotal = cart.reduce((sum, l) => sum + (l.variation.priceMoney?.amount ?? 0) * l.quantity, 0);
  const cartStand = stands.find((s) => s.locationId === cartLocationId) ?? null;
  // Everything shut: a fan should be told once, plainly, rather than left to
  // infer it from four greyed-out cards. We have no schedule feed, so this
  // never claims when the next game is.
  const allClosed = stands.length > 0 && openStandCount === 0;

  // Open stands first; closed ones dim at the bottom.
  const orderedStands = [...stands].sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    return a.slot - b.slot;
  });

  /** Opening a different stand while a cart exists has to be a deliberate act. */
  function openStand(locationId: string) {
    if (cart.length > 0 && cartLocationId && cartLocationId !== locationId) {
      setPendingStandId(locationId);
      return;
    }
    setSelectedStandId(locationId);
  }

  function confirmReplaceCart() {
    if (!pendingStandId) return;
    setCart([]);
    setCartLocationId(null);
    setSelectedStandId(pendingStandId);
    setPendingStandId(null);
  }
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
    <div
      className="flex flex-col items-center px-4 py-6 max-w-md mx-auto"
      /* Room for the sticky cart bar so it never sits on the last card. */
      style={cartCount > 0 && !selectedStandId ? { paddingBottom: "6rem" } : undefined}
    >
      {/* Header */}
      <header className="an-header w-full">
        <span className="an-wordmark an-label">ArenaPulse</span>
        <span className="an-venue">Save-On-Foods Memorial Centre · Victoria Royals</span>
      </header>

      <h1 className="an-headline an-display w-full">
        Order food
        <br />
        without missing
        <br />
        the game
      </h1>

      {/* The obvious way in. Tapping a stand on the map still opens its menu
          directly — this exists because the map alone was not discoverable. */}
      <button
        type="button"
        onClick={() => standsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="order-cta an-tap w-full mb-4"
        disabled={stands.length === 0}
        aria-label="Jump to the list of stands"
      >
        <span className="order-cta-main an-display">Order food</span>
        <span className="order-cta-sub">
          {stands.length === 0
            ? "Loading stands…"
            : openStandCount > 0
              ? `${openStandCount} of ${stands.length} stands open now`
              : "See the menus — stands open on game day"}
        </span>
      </button>

      <CategoryFilter selected={selectedCategory} onChange={handleCategoryChange} />

      <div ref={standsRef} className="an-section-head w-full">
        <h2 className="an-display">Stands</h2>
        {/* The map is secondary now: a fan lands on the cards. */}
        <button
          type="button"
          onClick={() => setViewMode(viewMode === "map" ? "list" : "map")}
          className="an-ghost-btn an-tap an-label"
          aria-label={viewMode === "map" ? "Show the stand list" : "Show the arena map"}
        >
          {viewMode === "map" ? "List" : "Map"}
        </button>
      </div>

      {allClosed && (
        <div className="an-empty" role="status">
          <p className="an-empty-title an-display">Stands are closed right now</p>
          <p className="an-empty-sub">Ordering opens on game day. Browse the menus below.</p>
        </div>
      )}

      {!allClosed && updatedAgoLabel && (
        <p className="w-full text-[10px] mb-2" style={{ color: "var(--text-tertiary)" }}>
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
            onNodeClick={openStand}
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
        <div className="w-full mb-4 flex flex-col gap-2.5">
          {orderedStands.length === 0 && (
            <p className="text-sm py-6 text-center" style={{ color: "var(--text-tertiary)" }}>
              Loading stands…
            </p>
          )}
          {orderedStands.map((s) => (
            <StandCard
              key={s.locationId}
              stand={s}
              busyness={busynessByLocation[s.locationId]}
              sells={s.sells ?? null}
              inSeatSection={inSeatSection}
              onOpen={openStand}
              dim={!allClosed}
              showMeter={!allClosed}
            />
          ))}
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
      {cartCount > 0 && !selectedStandId && (
        <div className="cart-bar">
          <button
            type="button"
            className="cart-bar-btn"
            onClick={() => cartLocationId && setSelectedStandId(cartLocationId)}
            aria-label={`View cart, ${cartCount} items, ${(cartSubtotal / 100).toFixed(2)} dollars`}
          >
            <span>View cart{cartStand ? ` · ${cartStand.fanName ?? cartStand.displayName}` : ""}</span>
            <span className="flex items-center gap-2">
              <span className="cart-bar-count">{cartCount}</span>
              <span>${(cartSubtotal / 100).toFixed(2)}</span>
            </span>
          </button>
        </div>
      )}

      {pendingStandId && (
        <div className="an-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Start a new cart?">
          <div className="an-dialog">
            <h2 className="an-display">Start a new cart?</h2>
            <p>
              Your cart is from {cartStand ? (cartStand.fanName ?? cartStand.displayName) : "another stand"}. An order
              can only go to one stand, so opening a different one clears it.
            </p>
            <div className="an-dialog-actions">
              <button type="button" className="an-btn-ghost an-tap" onClick={() => setPendingStandId(null)}>
                Keep my cart
              </button>
              <button type="button" className="an-btn-primary an-tap" onClick={confirmReplaceCart}>
                Clear and switch
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedStand && (
        <OrderPanel
          busyness={busynessByLocation[selectedStand.locationId] ?? null}
          cart={cart}
          setCart={setCart}
          onCartStandChange={setCartLocationId}
          stand={selectedStand}
          heat={selectedStandHeat}
          square={squareConfig}
          onClose={() => setSelectedStandId(null)}
        />
      )}
    </div>
  );
}
