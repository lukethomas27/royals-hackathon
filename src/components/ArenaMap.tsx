"use client";

import { HeatState } from "@/lib/types";

interface ArenaMapProps {
  heatState: HeatState;
  activeLocations: Set<string> | null;
  bestLocation: string | null;
  onNodeClick?: (locationId: string) => void;
}

// ── Arena geometry ──
const CX = 300;
const CY = 220;

// Rink proportions (NHL standard ~200ft x 85ft ≈ 2.35:1)
const RINK_HW = 160; // half-width
const RINK_HH = 68;  // half-height
const CORNER_R = RINK_HH; // rounded ends

// Seating bowl (surrounds rink)
const BOWL_PAD = 52; // gap between rink boards and outer seating edge
const BOWL_HW = RINK_HW + BOWL_PAD;
const BOWL_HH = RINK_HH + BOWL_PAD;
const BOWL_CR = CORNER_R + BOWL_PAD;

// Concourse ring (outside seating)
const CONCOURSE_PAD = 28;
const CONC_HW = BOWL_HW + CONCOURSE_PAD;
const CONC_HH = BOWL_HH + CONCOURSE_PAD;
const CONC_CR = BOWL_CR + CONCOURSE_PAD;

// ── Concession positions (mapped to real SOFMC section locations) ──
const CONCESSIONS: {
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
  section: string;
}[] = [
  // Sec 101 area — top-left concourse
  {
    id: "SOFMC Island Canteen",
    label: "Island Canteen",
    shortLabel: "Canteen",
    x: CX - 120,
    y: CY - CONC_HH - 6,
    section: "101",
  },
  // Sec 105-106 area — top-right concourse
  {
    id: "SOFMC Island Slice",
    label: "Island Slice",
    shortLabel: "Pizza",
    x: CX + 110,
    y: CY - CONC_HH - 6,
    section: "105",
  },
  // Sec 107-111 — right end concourse
  {
    id: "SOFMC ReMax Fan Deck",
    label: "ReMax Fan Deck",
    shortLabel: "Fan Deck",
    x: CX + CONC_HW + 10,
    y: CY,
    section: "108",
  },
  // Sec 113 area — bottom-right concourse
  {
    id: "SOFMC TacoTacoTaco",
    label: "TacoTacoTaco",
    shortLabel: "Tacos",
    x: CX + 90,
    y: CY + CONC_HH + 6,
    section: "113",
  },
  // Sec 113 area — bottom-center concourse
  {
    id: "SOFMC Phillips Bar",
    label: "Phillips Bar",
    shortLabel: "Bar",
    x: CX - 70,
    y: CY + CONC_HH + 6,
    section: "112",
  },
  // Sec 116 — left end concourse
  {
    id: "SOFMC Portable Stations",
    label: "Portable Stations",
    shortLabel: "Portable",
    x: CX - CONC_HW - 10,
    y: CY,
    section: "117",
  },
];

// ── Seating sections distributed around the bowl ──
function generateSections(): { number: number; x: number; y: number; angle: number }[] {
  const sections: { number: number; x: number; y: number; angle: number }[] = [];
  // Place sections along an elliptical path at the midpoint of the seating bowl
  const midHW = RINK_HW + BOWL_PAD * 0.55;
  const midHH = RINK_HH + BOWL_PAD * 0.55;

  // Sections 101-119 placed clockwise starting from top-left
  const sectionAngles: { num: number; angle: number }[] = [];

  // Top side: 101-106 (π to 0, i.e. left-to-right across top)
  for (let i = 0; i < 6; i++) {
    sectionAngles.push({ num: 101 + i, angle: Math.PI - 0.15 - i * (Math.PI - 0.3) / 5 });
  }
  // Right end: 107-109
  for (let i = 0; i < 3; i++) {
    sectionAngles.push({ num: 107 + i, angle: -0.15 - i * 0.55 });
  }
  // Bottom side: 110-115 (right-to-left across bottom)
  for (let i = 0; i < 6; i++) {
    sectionAngles.push({ num: 110 + i, angle: -Math.PI + 0.15 + i * (Math.PI - 0.3) / 5 });
  }
  // Left end: 116-119
  for (let i = 0; i < 4; i++) {
    sectionAngles.push({ num: 116 + i, angle: Math.PI + 0.15 + i * 0.42 });
  }

  for (const sa of sectionAngles) {
    sections.push({
      number: sa.num,
      x: CX + Math.cos(sa.angle) * midHW,
      y: CY - Math.sin(sa.angle) * midHH,
      angle: sa.angle,
    });
  }
  return sections;
}

const SECTIONS = generateSections();

// ── Color helpers ──
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

// Rounded-rect path builder for rink/bowl shapes
function rrectPath(cx: number, cy: number, hw: number, hh: number, cr: number): string {
  const r = Math.min(cr, hh); // clamp radius
  return `
    M ${cx - hw + r} ${cy - hh}
    L ${cx + hw - r} ${cy - hh}
    A ${r} ${r} 0 0 1 ${cx + hw} ${cy - hh + r}
    L ${cx + hw} ${cy + hh - r}
    A ${r} ${r} 0 0 1 ${cx + hw - r} ${cy + hh}
    L ${cx - hw + r} ${cy + hh}
    A ${r} ${r} 0 0 1 ${cx - hw} ${cy + hh - r}
    L ${cx - hw} ${cy - hh + r}
    A ${r} ${r} 0 0 1 ${cx - hw + r} ${cy - hh}
    Z`;
}

export default function ArenaMap({ heatState, activeLocations, bestLocation, onNodeClick }: ArenaMapProps) {
  const rinkPath = rrectPath(CX, CY, RINK_HW, RINK_HH, CORNER_R);
  const bowlPath = rrectPath(CX, CY, BOWL_HW, BOWL_HH, BOWL_CR);
  const concoursePath = rrectPath(CX, CY, CONC_HW, CONC_HH, CONC_CR);

  // Faceoff positions
  const endZoneDots: [number, number][] = [
    [CX - 90, CY - 34],
    [CX - 90, CY + 34],
    [CX + 90, CY - 34],
    [CX + 90, CY + 34],
  ];
  const neutralDots: [number, number][] = [
    [CX - 34, CY - 34],
    [CX - 34, CY + 34],
    [CX + 34, CY - 34],
    [CX + 34, CY + 34],
  ];

  return (
    <svg
      viewBox="0 10 600 430"
      className="w-full max-w-lg mx-auto"
      style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }}
    >
      <defs>
        {/* Ice surface */}
        <radialGradient id="ice" cx="50%" cy="45%">
          <stop offset="0%" stopColor="#e8f0fa" />
          <stop offset="80%" stopColor="#d0dff0" />
          <stop offset="100%" stopColor="#b8cce0" />
        </radialGradient>

        {/* Seating bowl tiers */}
        <radialGradient id="bowl-fill" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#14203a" />
          <stop offset="100%" stopColor="#0c1628" />
        </radialGradient>

        {/* Concourse */}
        <linearGradient id="concourse-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e1a2e" />
          <stop offset="100%" stopColor="#091322" />
        </linearGradient>

        {/* Boards shadow */}
        <filter id="boards-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.6" />
        </filter>

        {/* Glow filter for concession nodes */}
        <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Heat bloom gradients */}
        {CONCESSIONS.map((c) => {
          const heat = heatState[c.id] || 0;
          const color = heatToColor(heat);
          const cs = colorToString(color);
          return (
            <radialGradient key={`g-${c.id}`} id={`g-${c.id.replace(/\s/g, "-")}`}>
              <stop offset="0%" stopColor={cs} stopOpacity={0.9} />
              <stop offset="40%" stopColor={cs} stopOpacity={0.4} />
              <stop offset="100%" stopColor={cs} stopOpacity={0} />
            </radialGradient>
          );
        })}

        {/* Dasher board pattern (subtle tick marks) */}
        <pattern id="dasher" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(0)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#5a7da8" strokeWidth="0.3" opacity="0.3" />
        </pattern>
      </defs>

      {/* ════════════════ CONCOURSE (outermost ring) ════════════════ */}
      <path d={concoursePath} fill="url(#concourse-fill)" stroke="#1a2d4a" strokeWidth="1.5" />

      {/* Concourse floor texture — subtle radial lines */}
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const inner = { x: CX + Math.cos(angle) * (BOWL_HW + 4), y: CY + Math.sin(angle) * (BOWL_HH + 4) };
        const outer = { x: CX + Math.cos(angle) * (CONC_HW - 2), y: CY + Math.sin(angle) * (CONC_HH - 2) };
        return (
          <line
            key={`ct-${i}`}
            x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke="#1a2d4a" strokeWidth="0.5" opacity="0.4"
          />
        );
      })}

      {/* ════════════════ SEATING BOWL ════════════════ */}
      <path d={bowlPath} fill="url(#bowl-fill)" stroke="#243554" strokeWidth="1" />

      {/* Seating tier lines (3 concentric rings inside the bowl) */}
      {[0.3, 0.6, 0.85].map((t, i) => {
        const tHW = RINK_HW + BOWL_PAD * t + 6;
        const tHH = RINK_HH + BOWL_PAD * t + 6;
        const tCR = CORNER_R + BOWL_PAD * t + 6;
        return (
          <path
            key={`tier-${i}`}
            d={rrectPath(CX, CY, tHW, tHH, tCR)}
            fill="none"
            stroke="#1e3250"
            strokeWidth="0.6"
            opacity={0.5 + i * 0.15}
          />
        );
      })}

      {/* Section labels */}
      {SECTIONS.map((sec) => (
        <text
          key={`sec-${sec.number}`}
          x={sec.x}
          y={sec.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#3d5a80"
          fontSize="8.5"
          fontFamily="'JetBrains Mono', 'SF Mono', monospace"
          fontWeight="600"
        >
          {sec.number}
        </text>
      ))}

      {/* ════════════════ BOARDS ════════════════ */}
      {/* Outer boards (dark) */}
      <path
        d={rinkPath}
        fill="none"
        stroke="#f5f5f0"
        strokeWidth="4"
        filter="url(#boards-shadow)"
      />
      {/* Inner boards highlight */}
      <path d={rinkPath} fill="none" stroke="#d4dce8" strokeWidth="1" opacity="0.3" />

      {/* ════════════════ ICE SURFACE ════════════════ */}
      <path d={rinkPath} fill="url(#ice)" />

      {/* Slight sheen on ice */}
      <path
        d={rinkPath}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
      />

      {/* ── Center red line ── */}
      <line
        x1={CX} y1={CY - RINK_HH + 4} x2={CX} y2={CY + RINK_HH - 4}
        stroke="#c41e3a" strokeWidth="3" opacity="0.85"
      />
      {/* Center line edge stripes */}
      <line
        x1={CX - 1.8} y1={CY - RINK_HH + 4} x2={CX - 1.8} y2={CY + RINK_HH - 4}
        stroke="#ffffff" strokeWidth="0.5" opacity="0.4"
      />
      <line
        x1={CX + 1.8} y1={CY - RINK_HH + 4} x2={CX + 1.8} y2={CY + RINK_HH - 4}
        stroke="#ffffff" strokeWidth="0.5" opacity="0.4"
      />

      {/* ── Blue lines ── */}
      <line
        x1={CX - 55} y1={CY - RINK_HH + 4} x2={CX - 55} y2={CY + RINK_HH - 4}
        stroke="#0047ab" strokeWidth="3.5" opacity="0.9"
      />
      <line
        x1={CX + 55} y1={CY - RINK_HH + 4} x2={CX + 55} y2={CY + RINK_HH - 4}
        stroke="#0047ab" strokeWidth="3.5" opacity="0.9"
      />

      {/* ── Goal lines ── */}
      <line
        x1={CX - RINK_HW + 24} y1={CY - RINK_HH + 4}
        x2={CX - RINK_HW + 24} y2={CY + RINK_HH - 4}
        stroke="#c41e3a" strokeWidth="1.2" opacity="0.5"
      />
      <line
        x1={CX + RINK_HW - 24} y1={CY - RINK_HH + 4}
        x2={CX + RINK_HW - 24} y2={CY + RINK_HH - 4}
        stroke="#c41e3a" strokeWidth="1.2" opacity="0.5"
      />

      {/* ── Center circle ── */}
      <circle cx={CX} cy={CY} r={24} fill="none" stroke="#0047ab" strokeWidth="1.5" opacity="0.8" />
      <circle cx={CX} cy={CY} r={2.5} fill="#0047ab" opacity="0.9" />

      {/* ── End zone faceoff circles ── */}
      {endZoneDots.map(([fx, fy], i) => (
        <g key={`efc-${i}`}>
          <circle cx={fx} cy={fy} r={20} fill="none" stroke="#c41e3a" strokeWidth="1.2" opacity="0.5" />
          <circle cx={fx} cy={fy} r={2.5} fill="#c41e3a" opacity="0.7" />
          {/* Hash marks on faceoff circles */}
          <line x1={fx - 22} y1={fy - 6} x2={fx - 22} y2={fy - 16} stroke="#c41e3a" strokeWidth="0.8" opacity="0.4" />
          <line x1={fx + 22} y1={fy - 6} x2={fx + 22} y2={fy - 16} stroke="#c41e3a" strokeWidth="0.8" opacity="0.4" />
          <line x1={fx - 22} y1={fy + 6} x2={fx - 22} y2={fy + 16} stroke="#c41e3a" strokeWidth="0.8" opacity="0.4" />
          <line x1={fx + 22} y1={fy + 6} x2={fx + 22} y2={fy + 16} stroke="#c41e3a" strokeWidth="0.8" opacity="0.4" />
        </g>
      ))}

      {/* ── Neutral zone dots ── */}
      {neutralDots.map(([fx, fy], i) => (
        <circle key={`nd-${i}`} cx={fx} cy={fy} r={2.5} fill="#c41e3a" opacity="0.6" />
      ))}

      {/* ── Goal creases ── */}
      <path
        d={`M ${CX - RINK_HW + 24} ${CY - 12}
            A 14 14 0 0 1 ${CX - RINK_HW + 24} ${CY + 12}`}
        fill="#8fb8de" fillOpacity="0.25" stroke="#0047ab" strokeWidth="1" opacity="0.6"
      />
      <path
        d={`M ${CX + RINK_HW - 24} ${CY - 12}
            A 14 14 0 0 0 ${CX + RINK_HW - 24} ${CY + 12}`}
        fill="#8fb8de" fillOpacity="0.25" stroke="#0047ab" strokeWidth="1" opacity="0.6"
      />

      {/* ── Goal nets ── */}
      <rect
        x={CX - RINK_HW + 10} y={CY - 6} width={7} height={12} rx={2}
        fill="none" stroke="#888" strokeWidth="1.2" opacity="0.6"
      />
      <line x1={CX - RINK_HW + 11} y1={CY - 5} x2={CX - RINK_HW + 11} y2={CY + 5} stroke="#aaa" strokeWidth="0.3" opacity="0.5" />
      <line x1={CX - RINK_HW + 13} y1={CY - 5} x2={CX - RINK_HW + 13} y2={CY + 5} stroke="#aaa" strokeWidth="0.3" opacity="0.5" />
      <line x1={CX - RINK_HW + 15} y1={CY - 5} x2={CX - RINK_HW + 15} y2={CY + 5} stroke="#aaa" strokeWidth="0.3" opacity="0.5" />

      <rect
        x={CX + RINK_HW - 17} y={CY - 6} width={7} height={12} rx={2}
        fill="none" stroke="#888" strokeWidth="1.2" opacity="0.6"
      />
      <line x1={CX + RINK_HW - 16} y1={CY - 5} x2={CX + RINK_HW - 16} y2={CY + 5} stroke="#aaa" strokeWidth="0.3" opacity="0.5" />
      <line x1={CX + RINK_HW - 14} y1={CY - 5} x2={CX + RINK_HW - 14} y2={CY + 5} stroke="#aaa" strokeWidth="0.3" opacity="0.5" />
      <line x1={CX + RINK_HW - 12} y1={CY - 5} x2={CX + RINK_HW - 12} y2={CY + 5} stroke="#aaa" strokeWidth="0.3" opacity="0.5" />

      {/* ── Center ice logo ── */}
      <text
        x={CX} y={CY + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill="#c5a94e" fontSize="18" fontWeight="bold" opacity="0.12"
        fontFamily="'Georgia', serif"
      >
        ROYALS
      </text>

      {/* ════════════════ CONCESSION NODES ════════════════ */}
      {CONCESSIONS.map((c) => {
        const heat = heatState[c.id] || 0;
        const color = heatToColor(heat);
        const cs = colorToString(color);
        const bloomSize = 28 + heat * 40;
        const isHot = heat > 0.4;
        const isDimmed = activeLocations !== null && !activeLocations.has(c.id);
        const isBest = bestLocation === c.id;

        // Determine label placement based on position
        const isTop = c.y < CY;
        const labelY = isTop ? c.y - 28 : c.y + 30;
        const goLabelY = isTop ? c.y - 40 : c.y + 42;

        return (
          <g
            key={c.id}
            style={{ opacity: isDimmed ? 0.15 : 1, transition: "opacity 0.3s", cursor: isDimmed ? "default" : "pointer" }}
            onClick={() => { if (!isDimmed && onNodeClick) onNodeClick(c.id); }}
          >
            {/* Best-location pulsing ring */}
            {isBest && (
              <circle cx={c.x} cy={c.y} r={24}
                fill="none" stroke="#c5a94e" strokeWidth="2.5"
                style={{ animation: "pulse-ring 1.5s ease-in-out infinite" }}
              />
            )}

            {/* Heat bloom (glow behind node) */}
            <circle
              cx={c.x} cy={c.y} r={bloomSize}
              fill={`url(#g-${c.id.replace(/\s/g, "-")})`}
              style={isHot ? { animation: "pulse-glow 2s ease-in-out infinite" } : undefined}
            />

            {/* Connector line from node to bowl edge */}
            {(() => {
              const angle = Math.atan2(c.y - CY, c.x - CX);
              const bowlEdgeX = CX + Math.cos(angle) * (BOWL_HW - 4);
              const bowlEdgeY = CY + Math.sin(angle) * (BOWL_HH - 4);
              return (
                <line
                  x1={c.x} y1={c.y} x2={bowlEdgeX} y2={bowlEdgeY}
                  stroke={cs} strokeWidth="1" opacity="0.25"
                  strokeDasharray="3 3"
                />
              );
            })()}

            {/* Node circle */}
            <circle
              cx={c.x} cy={c.y} r={18}
              fill={cs}
              stroke={isBest ? "#c5a94e" : "rgba(255,255,255,0.8)"}
              strokeWidth={isBest ? 3 : 2}
              filter={isHot ? "url(#node-glow)" : undefined}
              style={{ transition: "fill 0.5s ease, stroke 0.3s ease" }}
            />

            {/* Icon/label inside node */}
            <text
              x={c.x} y={c.y + 1}
              textAnchor="middle" dominantBaseline="middle"
              fill="#fff" fontSize="7" fontWeight="700"
              fontFamily="'JetBrains Mono', 'SF Mono', monospace"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
            >
              {c.shortLabel}
            </text>

            {/* Label outside node */}
            <text
              x={c.x}
              y={labelY}
              textAnchor="middle"
              fill="#8da4c2"
              fontSize="6.5"
              fontFamily="'JetBrains Mono', 'SF Mono', monospace"
              fontWeight="500"
            >
              {c.label}
            </text>

            {/* Section reference */}
            <text
              x={c.x}
              y={isTop ? labelY - 9 : labelY + 9}
              textAnchor="middle"
              fill="#4a6485"
              fontSize="5.5"
              fontFamily="'JetBrains Mono', 'SF Mono', monospace"
            >
              SEC {c.section}
            </text>

            {/* GO HERE indicator */}
            {isBest && (
              <text x={c.x} y={goLabelY} textAnchor="middle" dominantBaseline="middle"
                fill="#c5a94e" fontSize="7" fontWeight="bold"
                fontFamily="'JetBrains Mono', 'SF Mono', monospace"
                style={{ animation: "pulse-ring 1.5s ease-in-out infinite" }}>
                GO HERE
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
