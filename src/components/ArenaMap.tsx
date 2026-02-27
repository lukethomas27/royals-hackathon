"use client";

import { HeatState } from "@/lib/types";

interface ArenaMapProps {
  heatState: HeatState;
}

const CONCESSIONS: {
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
}[] = [
  { id: "SOFMC Island Canteen", label: "Island Canteen", shortLabel: "Canteen", x: 50, y: 85 },
  { id: "SOFMC Island Slice", label: "Island Slice", shortLabel: "Pizza", x: 25, y: 75 },
  { id: "SOFMC Portable Stations", label: "Portable Stations", shortLabel: "Portable", x: 80, y: 40 },
  { id: "SOFMC ReMax Fan Deck", label: "ReMax Fan Deck", shortLabel: "Fan Deck", x: 50, y: 12 },
  { id: "SOFMC Phillips Bar", label: "Phillips Bar", shortLabel: "Bar", x: 20, y: 40 },
  { id: "SOFMC TacoTacoTaco", label: "TacoTacoTaco", shortLabel: "Tacos", x: 75, y: 75 },
];

function heatToColor(heat: number): string {
  if (heat < 0.33) {
    const t = heat / 0.33;
    return lerpColor("#22c55e", "#eab308", t);
  } else if (heat < 0.66) {
    const t = (heat - 0.33) / 0.33;
    return lerpColor("#eab308", "#f97316", t);
  } else {
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
  return heat * 20;
}

export default function ArenaMap({ heatState }: ArenaMapProps) {
  return (
    <svg viewBox="0 0 400 400" className="w-full max-w-md mx-auto">
      {/* Arena outline */}
      <rect x="30" y="30" width="340" height="340" rx="30" ry="30" fill="#1a2744" stroke="#c5a94e" strokeWidth="2" />

      {/* Ice rink */}
      <rect x="100" y="120" width="200" height="160" rx="40" ry="40" fill="#0f172a" stroke="#2563eb" strokeWidth="1.5" />
      {/* Center line */}
      <line x1="200" y1="120" x2="200" y2="280" stroke="#2563eb" strokeWidth="1" strokeDasharray="4,4" />
      {/* Center circle */}
      <circle cx="200" cy="200" r="20" fill="none" stroke="#2563eb" strokeWidth="1" />
      {/* Rink label */}
      <text x="200" y="205" textAnchor="middle" fill="#475569" fontSize="12" fontFamily="sans-serif">ICE</text>

      {/* Concession nodes */}
      {CONCESSIONS.map((c) => {
        const heat = heatState[c.id] || 0;
        const color = heatToColor(heat);
        const glowRadius = heatToGlow(heat);
        const cx = (c.x / 100) * 340 + 30;
        const cy = (c.y / 100) * 340 + 30;

        return (
          <g key={c.id}>
            {glowRadius > 0 && (
              <circle
                cx={cx}
                cy={cy}
                r={25 + glowRadius}
                fill={color}
                opacity={0.15}
                style={heat > 0.5 ? { animation: "pulse-glow 2s ease-in-out infinite" } : undefined}
              />
            )}
            <circle cx={cx} cy={cy} r={25} fill={color} stroke="#fff" strokeWidth="2" opacity={0.9} />
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="sans-serif">
              {c.shortLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
