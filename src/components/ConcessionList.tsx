"use client";

import { HeatState, SimulationStats } from "@/lib/types";

interface ConcessionListProps {
  heatState: HeatState;
  activeLocations: Set<string> | null;
  bestLocation: string | null;
  onNodeClick?: (locationId: string) => void;
  stats?: SimulationStats | null;
}

const CONCESSIONS = [
  { id: "SOFMC Island Canteen", label: "Island Canteen", shortLabel: "Canteen", section: "101" },
  { id: "SOFMC Island Slice", label: "Island Slice", shortLabel: "Pizza", section: "105" },
  { id: "SOFMC ReMax Fan Deck", label: "ReMax Fan Deck", shortLabel: "Fan Deck", section: "108" },
  { id: "SOFMC TacoTacoTaco", label: "TacoTacoTaco", shortLabel: "Tacos", section: "113" },
  { id: "SOFMC Phillips Bar", label: "Phillips Bar", shortLabel: "Bar", section: "112" },
  { id: "SOFMC Portable Stations", label: "Portable Stations", shortLabel: "Portable", section: "117" },
];

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
  heatState,
  activeLocations,
  bestLocation,
  onNodeClick,
  stats,
}: ConcessionListProps) {
  // Stable order: best location pinned to top, rest in fixed definition order
  const sorted = [...CONCESSIONS].sort((a, b) => {
    if (bestLocation === a.id) return -1;
    if (bestLocation === b.id) return 1;
    return 0;
  });

  return (
    <div className="w-full space-y-2">
      {sorted.map((c) => {
        const heat = heatState[c.id] || 0;
        const color = heatToColor(heat);
        const isDimmed = activeLocations !== null && !activeLocations.has(c.id);
        const isBest = bestLocation === c.id;
        const txCount = stats?.perLocation[c.id]?.transactionCount || 0;

        return (
          <button
            key={c.id}
            onClick={() => { if (!isDimmed && onNodeClick) onNodeClick(c.id); }}
            disabled={isDimmed}
            className="w-full rounded-xl px-4 py-3 flex items-center gap-3 transition-all"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: isBest ? "2px solid #c5a94e" : "1px solid var(--border-subtle)",
              opacity: isDimmed ? 0.3 : 1,
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
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {c.label}
                </span>
                {isBest && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: "rgba(197,169,78,0.15)", color: "#c5a94e" }}
                  >
                    BEST
                  </span>
                )}
              </div>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Section {c.section}
              </span>
            </div>

            {/* Heat status */}
            <div className="text-right shrink-0">
              <div className="text-xs font-semibold" style={{ color }}>
                {heatLabel(heat)}
              </div>
              {txCount > 0 && (
                <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  {txCount >= 1000 ? `${(txCount / 1000).toFixed(1)}k` : txCount} txns
                </div>
              )}
            </div>

            {/* Heat bar */}
            <div className="w-16 shrink-0">
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
