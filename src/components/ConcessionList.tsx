"use client";

import { HeatState, SimulationStats } from "@/lib/types";
import { MapStand } from "./ArenaMap";
import { StandBusyness } from "@/lib/square/busyness";

interface ConcessionListProps {
  stands: MapStand[];
  heatState: HeatState;
  /** Live busyness by location ID. Takes precedence over simulated heat. */
  busyness?: Record<string, StandBusyness>;
  activeLocations: Set<string> | null; // heatmapKeys
  bestLocation: string | null; // heatmapKey
  onNodeClick?: (locationId: string) => void;
  stats?: SimulationStats | null;
  inSeatSection?: string;
}

function heatToColor(heat: number): string {
  const stops = [
    { t: 0, r: 34, g: 197, b: 94 },
    { t: 0.35, r: 234, g: 179, b: 8 },
    { t: 0.65, r: 249, g: 115, b: 22 },
    { t: 1, r: 239, g: 68, b: 68 },
  ];
  const h = Math.max(0, Math.min(1, heat));
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (h >= stops[i].t && h <= stops[i + 1].t) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const range = upper.t - lower.t;
  const t = range === 0 ? 0 : (h - lower.t) / range;
  const smooth = t * t * (3 - 2 * t);
  const r = Math.round(lower.r + (upper.r - lower.r) * smooth);
  const g = Math.round(lower.g + (upper.g - lower.g) * smooth);
  const b = Math.round(lower.b + (upper.b - lower.b) * smooth);
  return `rgb(${r}, ${g}, ${b})`;
}

function heatLabel(heat: number): string {
  if (heat < 0.15) return "Quiet";
  if (heat < 0.35) return "Low";
  if (heat < 0.55) return "Moderate";
  if (heat < 0.75) return "Busy";
  return "Very busy";
}

export default function ConcessionList({
  stands,
  heatState,
  busyness,
  activeLocations,
  bestLocation,
  onNodeClick,
  inSeatSection = "108",
}: ConcessionListProps) {
  // Open stands first — a closed stand is not an option right now, however
  // quiet it is. Within each group: best location pinned, then slot order.
  const sorted = [...stands].sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    const aBest = a.heatmapKey !== null && bestLocation === a.heatmapKey;
    const bBest = b.heatmapKey !== null && bestLocation === b.heatmapKey;
    if (aBest !== bBest) return aBest ? -1 : 1;
    return a.slot - b.slot;
  });

  return (
    <div className="w-full space-y-2">
      {sorted.map((s) => {
        const live = busyness?.[s.locationId];
        // Live busyness wins. "closed" and "unknown" get no colour and no
        // label — a closed stand reads zero orders, which would look "Quiet".
        const liveHeat = live ? (live.state === "live" ? live.heat : null) : (s.heatmapKey && heatState[s.heatmapKey]) || 0;
        const heat = liveHeat ?? 0;
        const statusText =
          live?.state === "closed" ? "Closed" : liveHeat === null ? "No live data" : heatLabel(heat);
        const color = liveHeat === null ? "var(--text-tertiary)" : heatToColor(heat);
        const isDimmed = activeLocations !== null && s.heatmapKey !== null && !activeLocations.has(s.heatmapKey);
        const isBest = s.heatmapKey !== null && bestLocation === s.heatmapKey;
        const badge =
          s.role === "in_seat" ? `Delivered to your seat · section ${inSeatSection} area` : "Pick up at the stand";

        return (
          <button
            key={s.locationId}
            onClick={() => { if (!isDimmed && onNodeClick) onNodeClick(s.locationId); }}
            disabled={isDimmed}
            className="w-full rounded-xl px-4 py-3 flex items-center gap-3 transition-all"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: isBest ? "2px solid var(--accent-gold)" : "1px solid var(--border-subtle)",
              opacity: isDimmed ? 0.3 : s.isOpen ? 1 : 0.5,
              cursor: isDimmed ? "default" : "pointer",
            }}
          >
            {/* Heat indicator bar */}
            <div
              className="w-1.5 self-stretch rounded-full shrink-0"
              style={{ backgroundColor: color, transition: "background-color 0.5s" }}
            />

            {/* Info */}
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                  {s.fanName ?? s.displayName}
                </span>
                {isBest && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: "var(--accent-gold-bg)", color: "var(--accent-gold-dim)" }}
                  >
                    BEST
                  </span>
                )}
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                  style={
                    s.isOpen
                      ? { backgroundColor: "rgba(22,163,74,0.12)", color: "#16a34a" }
                      : { backgroundColor: "var(--heat-bar-bg)", color: "var(--text-tertiary)" }
                  }
                >
                  {s.isOpen ? "OPEN" : "CLOSED"}
                </span>
              </div>
              <span className="text-xs block truncate" style={{ color: "var(--text-tertiary)" }}>
                {badge}
              </span>
            </div>

            {/* Heat status */}
            <div className="text-right shrink-0">
              <div className="text-xs font-semibold" style={{ color }}>
                {statusText}
              </div>
              {liveHeat !== null && (
                <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  last 15 min
                </div>
              )}
            </div>

            {/* Heat bar — hidden on the narrowest phones, where the label and
                the colour stripe already carry the same information. */}
            <div className="hidden min-[360px]:block w-12 sm:w-16 shrink-0" style={{ visibility: liveHeat === null ? "hidden" : "visible" }}>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--heat-bar-bg)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(heat * 100, 3)}%`,
                    backgroundColor: color,
                    transition: "width 0.5s, background-color 0.5s",
                  }}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
