"use client";

import { HeatState } from "@/lib/types";

interface ArenaMapProps {
  heatState: HeatState;
}

// Rink center and seating bowl edge constants (must match rendering below)
const CX = 250;
const CY = 190;
const BOWL_TOP = CY - 64 - 30;    // rinkHH + 30 = 96 → y=94
const BOWL_BOT = CY + 64 + 30;    // y=286
const BOWL_LEFT = CX - 150 - 30;  // rinkHW + 30 = 180 → x=70
const BOWL_RIGHT = CX + 150 + 30; // x=430
const NODE_GAP = 32; // distance outside the bowl edge

const CONCESSIONS: {
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
}[] = [
  // Top side: 3 nodes evenly spaced
  { id: "SOFMC Phillips Bar",       label: "Phillips Bar",       shortLabel: "Bar",      x: CX - 110, y: BOWL_TOP - NODE_GAP },
  { id: "SOFMC ReMax Fan Deck",     label: "ReMax Fan Deck",     shortLabel: "Fan Deck", x: CX,       y: BOWL_TOP - NODE_GAP },
  { id: "SOFMC Portable Stations",  label: "Portable Stations",  shortLabel: "Portable", x: CX + 110, y: BOWL_TOP - NODE_GAP },
  // Bottom side: 3 nodes evenly spaced
  { id: "SOFMC Island Slice",       label: "Island Slice",       shortLabel: "Pizza",    x: CX - 110, y: BOWL_BOT + NODE_GAP },
  { id: "SOFMC Island Canteen",     label: "Island Canteen",     shortLabel: "Canteen",  x: CX,       y: BOWL_BOT + NODE_GAP },
  { id: "SOFMC TacoTacoTaco",       label: "TacoTacoTaco",       shortLabel: "Tacos",    x: CX + 110, y: BOWL_BOT + NODE_GAP },
];

function heatToColor(heat: number): { r: number; g: number; b: number } {
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
  return {
    r: Math.round(lower.r + (upper.r - lower.r) * smooth),
    g: Math.round(lower.g + (upper.g - lower.g) * smooth),
    b: Math.round(lower.b + (upper.b - lower.b) * smooth),
  };
}

function colorToString(c: { r: number; g: number; b: number }): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

// Seating sections 101-119 positioned around the rink
// Distributed: long sides get more sections, short ends get fewer
function generateSections(): { number: number; x: number; y: number }[] {
  const cx = 250;
  const cy = 190;
  // Sections follow a rectangular path around the rink (seating bowl)
  // Top side (101-105): left to right
  // Right end (106-108): top to bottom
  // Bottom side (109-114): right to left
  // Left end (115-117): bottom to top
  // Top-left corner area (118-119): fills remaining
  const sections: { number: number; x: number; y: number }[] = [];

  // Top side: 101-106 (left to right)
  for (let i = 0; i < 6; i++) {
    sections.push({ number: 101 + i, x: cx - 120 + i * 48, y: cy - 84 });
  }
  // Right end: 107-109 (top to bottom)
  for (let i = 0; i < 3; i++) {
    sections.push({ number: 107 + i, x: cx + 168, y: cy - 44 + i * 44 });
  }
  // Bottom side: 110-115 (right to left)
  for (let i = 0; i < 6; i++) {
    sections.push({ number: 110 + i, x: cx + 120 - i * 48, y: cy + 84 });
  }
  // Left end: 116-119 (bottom to top)
  for (let i = 0; i < 4; i++) {
    sections.push({ number: 116 + i, x: cx - 168, y: cy + 44 - i * 29 });
  }

  return sections;
}

const SECTIONS = generateSections();

export default function ArenaMap({ heatState }: ArenaMapProps) {
  // Rink geometry — proper hockey rink is 200ft x 85ft (roughly 2.35:1)
  const rinkCx = 250;
  const rinkCy = 190;
  const rinkW = 300; // half-width 150
  const rinkH = 128; // half-height 64
  const rinkHW = rinkW / 2;
  const rinkHH = rinkH / 2;
  const cornerR = rinkHH; // corners are semicircles on short side

  // Rink outline path (rounded rectangle with large corner radius)
  const rinkPath = `
    M ${rinkCx - rinkHW + cornerR} ${rinkCy - rinkHH}
    L ${rinkCx + rinkHW - cornerR} ${rinkCy - rinkHH}
    A ${cornerR} ${cornerR} 0 0 1 ${rinkCx + rinkHW} ${rinkCy - rinkHH + cornerR}
    L ${rinkCx + rinkHW} ${rinkCy + rinkHH - cornerR}
    A ${cornerR} ${cornerR} 0 0 1 ${rinkCx + rinkHW - cornerR} ${rinkCy + rinkHH}
    L ${rinkCx - rinkHW + cornerR} ${rinkCy + rinkHH}
    A ${cornerR} ${cornerR} 0 0 1 ${rinkCx - rinkHW} ${rinkCy + rinkHH - cornerR}
    L ${rinkCx - rinkHW} ${rinkCy - rinkHH + cornerR}
    A ${cornerR} ${cornerR} 0 0 1 ${rinkCx - rinkHW + cornerR} ${rinkCy - rinkHH}
    Z
  `;

  // Faceoff dot positions (NHL standard)
  const faceoffDots: [number, number][] = [
    [rinkCx - 80, rinkCy - 38],
    [rinkCx - 80, rinkCy + 38],
    [rinkCx + 80, rinkCy - 38],
    [rinkCx + 80, rinkCy + 38],
    // Neutral zone dots
    [rinkCx - 30, rinkCy - 38],
    [rinkCx - 30, rinkCy + 38],
    [rinkCx + 30, rinkCy - 38],
    [rinkCx + 30, rinkCy + 38],
  ];

  return (
    <svg viewBox="0 15 500 360" className="w-full max-w-lg mx-auto">
      <defs>
        {CONCESSIONS.map((c) => {
          const heat = heatState[c.id] || 0;
          const color = heatToColor(heat);
          const cs = colorToString(color);
          return (
            <radialGradient key={`g-${c.id}`} id={`g-${c.id.replace(/\s/g, "-")}`}>
              <stop offset="0%" stopColor={cs} stopOpacity={0.85} />
              <stop offset="50%" stopColor={cs} stopOpacity={0.35} />
              <stop offset="100%" stopColor={cs} stopOpacity={0} />
            </radialGradient>
          );
        })}
        {/* Ice surface gradient */}
        <radialGradient id="ice-surface" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#1a2840" />
          <stop offset="100%" stopColor="#0f1c30" />
        </radialGradient>
      </defs>

      {/* ===== SEATING BOWL ===== */}
      {/* Outer seating boundary - rounded rect matching rink shape but larger */}
      <rect x={rinkCx - rinkHW - 30} y={rinkCy - rinkHH - 30} width={rinkW + 60} height={rinkH + 60}
        rx={cornerR + 20} ry={cornerR + 20}
        fill="#0d1220" stroke="#1e293b" strokeWidth="1" />

      {/* Section labels */}
      {SECTIONS.map((sec) => (
        <text key={`sec-${sec.number}`} x={sec.x} y={sec.y}
          textAnchor="middle" dominantBaseline="middle"
          fill="#475569" fontSize="8" fontFamily="system-ui, sans-serif" fontWeight="500">
          {sec.number}
        </text>
      ))}

      {/* ===== ICE RINK ===== */}
      {/* Ice surface */}
      <path d={rinkPath} fill="url(#ice-surface)" stroke="#3b6eb5" strokeWidth="2" />

      {/* Boards highlight (inner stroke for depth) */}
      <path d={rinkPath} fill="none" stroke="#1e3a5f" strokeWidth="0.5" transform="translate(0,0)" />

      {/* Center red line */}
      <line x1={rinkCx} y1={rinkCy - rinkHH + 2} x2={rinkCx} y2={rinkCy + rinkHH - 2}
        stroke="#ef4444" strokeWidth="2.5" opacity={0.6} />

      {/* Blue lines */}
      <line x1={rinkCx - 50} y1={rinkCy - rinkHH + 2} x2={rinkCx - 50} y2={rinkCy + rinkHH - 2}
        stroke="#2563eb" strokeWidth="3" opacity={0.7} />
      <line x1={rinkCx + 50} y1={rinkCy - rinkHH + 2} x2={rinkCx + 50} y2={rinkCy + rinkHH - 2}
        stroke="#2563eb" strokeWidth="3" opacity={0.7} />

      {/* Center circle */}
      <circle cx={rinkCx} cy={rinkCy} r={22} fill="none" stroke="#2563eb" strokeWidth="1.5" opacity={0.6} />
      <circle cx={rinkCx} cy={rinkCy} r={2} fill="#2563eb" opacity={0.8} />

      {/* Faceoff circles (end zone) */}
      {faceoffDots.slice(0, 4).map(([fx, fy], i) => (
        <g key={`fc-${i}`}>
          <circle cx={fx} cy={fy} r={18} fill="none" stroke="#ef4444" strokeWidth="1" opacity={0.35} />
          <circle cx={fx} cy={fy} r={2} fill="#ef4444" opacity={0.6} />
        </g>
      ))}

      {/* Neutral zone faceoff dots */}
      {faceoffDots.slice(4).map(([fx, fy], i) => (
        <circle key={`nd-${i}`} cx={fx} cy={fy} r={2} fill="#ef4444" opacity={0.5} />
      ))}

      {/* Goal creases */}
      <path d={`M ${rinkCx - rinkHW + 18} ${rinkCy - 10} A 12 12 0 0 1 ${rinkCx - rinkHW + 18} ${rinkCy + 10}`}
        fill="#1e3a5f" fillOpacity={0.4} stroke="#2563eb" strokeWidth="0.8" opacity={0.6} />
      <path d={`M ${rinkCx + rinkHW - 18} ${rinkCy - 10} A 12 12 0 0 0 ${rinkCx + rinkHW - 18} ${rinkCy + 10}`}
        fill="#1e3a5f" fillOpacity={0.4} stroke="#2563eb" strokeWidth="0.8" opacity={0.6} />

      {/* Goal nets */}
      <rect x={rinkCx - rinkHW + 6} y={rinkCy - 5} width={5} height={10} rx={1}
        fill="none" stroke="#94a3b8" strokeWidth="1" opacity={0.5} />
      <rect x={rinkCx + rinkHW - 11} y={rinkCy - 5} width={5} height={10} rx={1}
        fill="none" stroke="#94a3b8" strokeWidth="1" opacity={0.5} />

      {/* Goal lines */}
      <line x1={rinkCx - rinkHW + 20} y1={rinkCy - rinkHH + 2} x2={rinkCx - rinkHW + 20} y2={rinkCy + rinkHH - 2}
        stroke="#ef4444" strokeWidth="1" opacity={0.25} />
      <line x1={rinkCx + rinkHW - 20} y1={rinkCy - rinkHH + 2} x2={rinkCx + rinkHW - 20} y2={rinkCy + rinkHH - 2}
        stroke="#ef4444" strokeWidth="1" opacity={0.25} />

      {/* ===== CONCESSION NODES ===== */}
      {CONCESSIONS.map((c) => {
        const heat = heatState[c.id] || 0;
        const color = heatToColor(heat);
        const cs = colorToString(color);
        const bloomSize = 24 + heat * 36;

        return (
          <g key={c.id}>
            {/* Heat bloom */}
            <circle cx={c.x} cy={c.y} r={bloomSize}
              fill={`url(#g-${c.id.replace(/\s/g, "-")})`}
              style={heat > 0.4 ? { animation: "pulse-glow 2s ease-in-out infinite" } : undefined}
            />
            {/* Node */}
            <circle cx={c.x} cy={c.y} r={20} fill={cs} stroke="#ffffff" strokeWidth="2"
              style={{ transition: "fill 0.5s ease" }} />
            {/* Label inside */}
            <text x={c.x} y={c.y + 1} textAnchor="middle" dominantBaseline="middle"
              fill="#fff" fontSize="7.5" fontWeight="bold" fontFamily="system-ui, sans-serif">
              {c.shortLabel}
            </text>
            {/* Label outside */}
            <text x={c.x} y={c.y + 30} textAnchor="middle"
              fill="#94a3b8" fontSize="6.5" fontFamily="system-ui, sans-serif">
              {c.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
