"use client";

import { StandBusyness } from "@/lib/square/busyness";

/**
 * Four-step bar meter plus label. The bands, the colours and the Closed /
 * "No live data" handling are the ones already in use — this only changes how
 * they are drawn.
 */
const STEPS = 4;

function heatColor(heat: number): string {
  if (heat < 0.35) return "#22c55e";
  if (heat < 0.55) return "#eab308";
  if (heat < 0.75) return "#f97316";
  return "#ef4444";
}

/** Quiet / Moderate / Busy / Very busy — one label per filled step. */
function stepsFilled(heat: number): number {
  if (heat < 0.35) return 1;
  if (heat < 0.55) return 2;
  if (heat < 0.75) return 3;
  return STEPS;
}

function label(heat: number): string {
  if (heat < 0.35) return "Quiet";
  if (heat < 0.55) return "Moderate";
  if (heat < 0.75) return "Busy";
  return "Very busy";
}

export default function BusynessMeter({
  busyness,
  size = "sm",
}: {
  busyness: StandBusyness | null | undefined;
  size?: "sm" | "md";
}) {
  const closed = busyness?.state === "closed";
  const heat = busyness?.state === "live" ? busyness.heat : null;
  const unknown = !closed && (heat === null || heat === undefined);

  const text = closed ? "Closed" : unknown ? "No live data" : label(heat!);
  const color = closed || unknown ? "var(--text-tertiary)" : heatColor(heat!);
  const filled = closed || unknown ? 0 : stepsFilled(heat!);

  return (
    <div className="busy-meter" role="img" aria-label={`Busyness: ${text}`}>
      <div className={`busy-meter-bars ${size === "md" ? "is-md" : ""}`}>
        {Array.from({ length: STEPS }, (_, i) => (
          <span
            key={i}
            className="busy-meter-step"
            style={{ backgroundColor: i < filled ? color : "var(--heat-bar-bg)" }}
          />
        ))}
      </div>
      <span className="busy-meter-label an-label" style={{ color }}>
        {text}
      </span>
    </div>
  );
}
