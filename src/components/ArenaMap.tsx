"use client";

import { HeatState, SimulationStats } from "@/lib/types";

interface ArenaMapProps {
  heatState: HeatState;
  activeLocations: Set<string> | null;
  bestLocation: string | null;
  onNodeClick?: (locationId: string) => void;
  stats?: SimulationStats | null;
}

// ── Arena geometry ──
const CX = 300;
const CY = 220;

const RINK_HW = 160;
const RINK_HH = 68;
const CORNER_R = RINK_HH;

const BOWL_PAD = 52;
const BOWL_HW = RINK_HW + BOWL_PAD;
const BOWL_HH = RINK_HH + BOWL_PAD;
const BOWL_CR = CORNER_R + BOWL_PAD;

const CONCOURSE_PAD = 28;
const CONC_HW = BOWL_HW + CONCOURSE_PAD;
const CONC_HH = BOWL_HH + CONCOURSE_PAD;
const CONC_CR = BOWL_CR + CONCOURSE_PAD;

// Node dimensions (rounded rectangle)
const NODE_W = 62;
const NODE_H = 30;
const NODE_RX = 8;

// ── Concession positions ──
const CONCESSIONS: {
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
  section: string;
}[] = [
  {
    id: "SOFMC Island Canteen",
    label: "Island Canteen",
    shortLabel: "Canteen",
    x: CX - 120,
    y: CY - CONC_HH - 10,
    section: "101",
  },
  {
    id: "SOFMC Island Slice",
    label: "Island Slice",
    shortLabel: "Pizza",
    x: CX + 110,
    y: CY - CONC_HH - 10,
    section: "105",
  },
  {
    id: "SOFMC ReMax Fan Deck",
    label: "ReMax Fan Deck",
    shortLabel: "Fan Deck",
    x: CX + CONC_HW + 14,
    y: CY,
    section: "108",
  },
  {
    id: "SOFMC TacoTacoTaco",
    label: "TacoTacoTaco",
    shortLabel: "Tacos",
    x: CX + 90,
    y: CY + CONC_HH + 10,
    section: "113",
  },
  {
    id: "SOFMC Phillips Bar",
    label: "Phillips Bar",
    shortLabel: "Bar",
    x: CX - 70,
    y: CY + CONC_HH + 10,
    section: "112",
  },
  {
    id: "SOFMC Portable Stations",
    label: "Portable Stations",
    shortLabel: "Portable",
    x: CX - CONC_HW - 14,
    y: CY,
    section: "117",
  },
];

// ── Seating sections ──
function generateSections(): { number: number; x: number; y: number; angle: number }[] {
  const sections: { number: number; x: number; y: number; angle: number }[] = [];
  const midHW = RINK_HW + BOWL_PAD * 0.55;
  const midHH = RINK_HH + BOWL_PAD * 0.55;

  const sectionAngles: { num: number; angle: number }[] = [];

  for (let i = 0; i < 6; i++) {
    sectionAngles.push({ num: 101 + i, angle: Math.PI - 0.15 - i * (Math.PI - 0.3) / 5 });
  }
  for (let i = 0; i < 3; i++) {
    sectionAngles.push({ num: 107 + i, angle: -0.15 - i * 0.55 });
  }
  for (let i = 0; i < 6; i++) {
    sectionAngles.push({ num: 110 + i, angle: -Math.PI + 0.15 + i * (Math.PI - 0.3) / 5 });
  }
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

function lighten(c: { r: number; g: number; b: number }, amount: number): string {
  return `rgb(${Math.min(255, c.r + amount)}, ${Math.min(255, c.g + amount)}, ${Math.min(255, c.b + amount)})`;
}

function darken(c: { r: number; g: number; b: number }, amount: number): string {
  return `rgb(${Math.max(0, c.r - amount)}, ${Math.max(0, c.g - amount)}, ${Math.max(0, c.b - amount)})`;
}

function rrectPath(cx: number, cy: number, hw: number, hh: number, cr: number): string {
  const r = Math.min(cr, hh);
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

export default function ArenaMap({ heatState, activeLocations, bestLocation, onNodeClick, stats }: ArenaMapProps) {
  const rinkPath = rrectPath(CX, CY, RINK_HW, RINK_HH, CORNER_R);
  const bowlPath = rrectPath(CX, CY, BOWL_HW, BOWL_HH, BOWL_CR);
  const concoursePath = rrectPath(CX, CY, CONC_HW, CONC_HH, CONC_CR);

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
      viewBox="-10 10 620 430"
      className="w-full max-w-lg mx-auto"
      style={{ filter: `drop-shadow(0 4px 24px rgba(0,0,0,var(--arena-shadow-opacity)))` }}
    >
      <defs>
        {/* Ice surface */}
        <radialGradient id="ice" cx="50%" cy="45%">
          <stop offset="0%" stopColor="#e8f0fa" />
          <stop offset="80%" stopColor="#d0dff0" />
          <stop offset="100%" stopColor="#b8cce0" />
        </radialGradient>

        {/* Boards shadow */}
        <filter id="boards-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.4" />
        </filter>

        {/* Node shadow (lifted card/button) */}
        <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.4" />
        </filter>

        {/* Glow filter for hot nodes */}
        <filter id="node-glow" x="-40%" y="-50%" width="180%" height="220%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Best-location gold glow */}
        <filter id="gold-glow" x="-40%" y="-50%" width="180%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feFlood floodColor="#c5a94e" floodOpacity="0.5" result="gold" />
          <feComposite in="gold" in2="blur" operator="in" result="goldBlur" />
          <feMerge>
            <feMergeNode in="goldBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Per-node gradients */}
        {CONCESSIONS.map((c) => {
          const heat = heatState[c.id] || 0;
          const color = heatToColor(heat);
          const cs = colorToString(color);
          const light = lighten(color, 45);
          const dark = darken(color, 35);
          return [
            <radialGradient key={`bloom-${c.id}`} id={`bloom-${c.id.replace(/\s/g, "-")}`}>
              <stop offset="0%" stopColor={cs} stopOpacity={0.8} />
              <stop offset="35%" stopColor={cs} stopOpacity={0.3} />
              <stop offset="100%" stopColor={cs} stopOpacity={0} />
            </radialGradient>,
            <linearGradient
              key={`face-${c.id}`}
              id={`face-${c.id.replace(/\s/g, "-")}`}
              x1="0" y1="0" x2="0" y2="1"
            >
              <stop offset="0%" stopColor={light} />
              <stop offset="45%" stopColor={cs} />
              <stop offset="100%" stopColor={dark} />
            </linearGradient>,
          ];
        })}
      </defs>

      {/* ════════════════ CONCOURSE ════════════════ */}
      <path
        d={concoursePath}
        fill="var(--arena-concourse)"
        stroke="var(--arena-concourse-stroke)"
        strokeWidth="1.5"
      />

      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const inner = { x: CX + Math.cos(angle) * (BOWL_HW + 4), y: CY + Math.sin(angle) * (BOWL_HH + 4) };
        const outer = { x: CX + Math.cos(angle) * (CONC_HW - 2), y: CY + Math.sin(angle) * (CONC_HH - 2) };
        return (
          <line
            key={`ct-${i}`}
            x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke="var(--arena-concourse-line)" strokeWidth="0.5" opacity="0.4"
          />
        );
      })}

      {/* ════════════════ SEATING BOWL ════════════════ */}
      <path d={bowlPath} fill="var(--arena-bowl)" stroke="var(--arena-bowl-stroke)" strokeWidth="1" />

      {[0.3, 0.6, 0.85].map((t, i) => {
        const tHW = RINK_HW + BOWL_PAD * t + 6;
        const tHH = RINK_HH + BOWL_PAD * t + 6;
        const tCR = CORNER_R + BOWL_PAD * t + 6;
        return (
          <path
            key={`tier-${i}`}
            d={rrectPath(CX, CY, tHW, tHH, tCR)}
            fill="none"
            stroke="var(--arena-tier-line)"
            strokeWidth="0.6"
            opacity={0.4 + i * 0.15}
          />
        );
      })}

      {SECTIONS.map((sec) => (
        <text
          key={`sec-${sec.number}`}
          x={sec.x} y={sec.y}
          textAnchor="middle" dominantBaseline="middle"
          fill="var(--arena-section-text)" fontSize="8.5"
          fontFamily="'JetBrains Mono', 'SF Mono', ui-monospace, monospace"
          fontWeight="600"
        >
          {sec.number}
        </text>
      ))}

      {/* ════════════════ BOARDS ════════════════ */}
      <path d={rinkPath} fill="none" stroke="var(--arena-boards)" strokeWidth="4" filter="url(#boards-shadow)" />
      <path d={rinkPath} fill="none" stroke="var(--arena-boards-inner)" strokeWidth="0.8" opacity="0.3" />

      {/* ════════════════ ICE SURFACE ════════════════ */}
      <path d={rinkPath} fill="url(#ice)" />
      <path d={rinkPath} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

      {/* Center red line */}
      <line x1={CX} y1={CY - RINK_HH + 4} x2={CX} y2={CY + RINK_HH - 4} stroke="#c41e3a" strokeWidth="3" opacity="0.85" />
      <line x1={CX - 1.8} y1={CY - RINK_HH + 4} x2={CX - 1.8} y2={CY + RINK_HH - 4} stroke="#fff" strokeWidth="0.5" opacity="0.4" />
      <line x1={CX + 1.8} y1={CY - RINK_HH + 4} x2={CX + 1.8} y2={CY + RINK_HH - 4} stroke="#fff" strokeWidth="0.5" opacity="0.4" />

      {/* Blue lines */}
      <line x1={CX - 55} y1={CY - RINK_HH + 4} x2={CX - 55} y2={CY + RINK_HH - 4} stroke="#0047ab" strokeWidth="3.5" opacity="0.9" />
      <line x1={CX + 55} y1={CY - RINK_HH + 4} x2={CX + 55} y2={CY + RINK_HH - 4} stroke="#0047ab" strokeWidth="3.5" opacity="0.9" />

      {/* Goal lines */}
      <line x1={CX - RINK_HW + 24} y1={CY - RINK_HH + 4} x2={CX - RINK_HW + 24} y2={CY + RINK_HH - 4} stroke="#c41e3a" strokeWidth="1.2" opacity="0.5" />
      <line x1={CX + RINK_HW - 24} y1={CY - RINK_HH + 4} x2={CX + RINK_HW - 24} y2={CY + RINK_HH - 4} stroke="#c41e3a" strokeWidth="1.2" opacity="0.5" />

      {/* Center circle */}
      <circle cx={CX} cy={CY} r={24} fill="none" stroke="#0047ab" strokeWidth="1.5" opacity="0.8" />
      <circle cx={CX} cy={CY} r={2.5} fill="#0047ab" opacity="0.9" />

      {/* End zone faceoff circles */}
      {endZoneDots.map(([fx, fy], i) => (
        <g key={`efc-${i}`}>
          <circle cx={fx} cy={fy} r={20} fill="none" stroke="#c41e3a" strokeWidth="1.2" opacity="0.5" />
          <circle cx={fx} cy={fy} r={2.5} fill="#c41e3a" opacity="0.7" />
          <line x1={fx - 22} y1={fy - 6} x2={fx - 22} y2={fy - 16} stroke="#c41e3a" strokeWidth="0.8" opacity="0.4" />
          <line x1={fx + 22} y1={fy - 6} x2={fx + 22} y2={fy - 16} stroke="#c41e3a" strokeWidth="0.8" opacity="0.4" />
          <line x1={fx - 22} y1={fy + 6} x2={fx - 22} y2={fy + 16} stroke="#c41e3a" strokeWidth="0.8" opacity="0.4" />
          <line x1={fx + 22} y1={fy + 6} x2={fx + 22} y2={fy + 16} stroke="#c41e3a" strokeWidth="0.8" opacity="0.4" />
        </g>
      ))}

      {/* Neutral zone dots */}
      {neutralDots.map(([fx, fy], i) => (
        <circle key={`nd-${i}`} cx={fx} cy={fy} r={2.5} fill="#c41e3a" opacity="0.6" />
      ))}

      {/* Goal creases */}
      <path
        d={`M ${CX - RINK_HW + 24} ${CY - 12} A 14 14 0 0 1 ${CX - RINK_HW + 24} ${CY + 12}`}
        fill="#8fb8de" fillOpacity="0.25" stroke="#0047ab" strokeWidth="1" opacity="0.6"
      />
      <path
        d={`M ${CX + RINK_HW - 24} ${CY - 12} A 14 14 0 0 0 ${CX + RINK_HW - 24} ${CY + 12}`}
        fill="#8fb8de" fillOpacity="0.25" stroke="#0047ab" strokeWidth="1" opacity="0.6"
      />

      {/* Goal nets */}
      <rect x={CX - RINK_HW + 10} y={CY - 6} width={7} height={12} rx={2} fill="none" stroke="#888" strokeWidth="1.2" opacity="0.6" />
      {[11, 13, 15].map((dx) => (
        <line key={`nl-${dx}`} x1={CX - RINK_HW + dx} y1={CY - 5} x2={CX - RINK_HW + dx} y2={CY + 5} stroke="#aaa" strokeWidth="0.3" opacity="0.5" />
      ))}
      <rect x={CX + RINK_HW - 17} y={CY - 6} width={7} height={12} rx={2} fill="none" stroke="#888" strokeWidth="1.2" opacity="0.6" />
      {[-16, -14, -12].map((dx) => (
        <line key={`nr-${dx}`} x1={CX + RINK_HW + dx} y1={CY - 5} x2={CX + RINK_HW + dx} y2={CY + 5} stroke="#aaa" strokeWidth="0.3" opacity="0.5" />
      ))}

      {/* Center ice logo */}
      <text
        x={CX} y={CY + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill="#c5a94e" fontSize="18" fontWeight="bold" opacity="0.12"
        fontFamily="'Georgia', serif"
      >
        ROYALS
      </text>

      {/* ════════════════ CONCESSION NODES (Rounded Rect Pills) ════════════════ */}
      {CONCESSIONS.map((c) => {
        const heat = heatState[c.id] || 0;
        const color = heatToColor(heat);
        const cs = colorToString(color);
        const bloomSize = 34 + heat * 48;
        const isHot = heat > 0.4;
        const isDimmed = activeLocations !== null && !activeLocations.has(c.id);
        const isBest = bestLocation === c.id;

        const isTop = c.y < CY;
        const sectionLabelY = isTop ? c.y - NODE_H / 2 - 8 : c.y + NODE_H / 2 + 12;
        const goLabelY = isTop ? c.y - NODE_H / 2 - 20 : c.y + NODE_H / 2 + 24;

        const faceId = `face-${c.id.replace(/\s/g, "-")}`;
        const bloomId = `bloom-${c.id.replace(/\s/g, "-")}`;

        // Rect bounds
        const rx = c.x - NODE_W / 2;
        const ry = c.y - NODE_H / 2;

        return (
          <g
            key={c.id}
            style={{
              opacity: isDimmed ? 0.12 : 1,
              transition: "opacity 0.4s ease",
              cursor: isDimmed ? "default" : "pointer",
            }}
            onClick={() => { if (!isDimmed && onNodeClick) onNodeClick(c.id); }}
          >
            {/* Best-location pulsing ring */}
            {isBest && (
              <rect
                x={rx - 5} y={ry - 5} width={NODE_W + 10} height={NODE_H + 10} rx={NODE_RX + 3}
                fill="none" stroke="#c5a94e" strokeWidth="2.5"
                style={{ animation: "pulse-ring 1.5s ease-in-out infinite" }}
              />
            )}

            {/* Heat bloom */}
            <circle
              cx={c.x} cy={c.y} r={bloomSize}
              fill={`url(#${bloomId})`}
              style={isHot ? { animation: "pulse-glow 2s ease-in-out infinite" } : undefined}
            />

            {/* Connector to bowl */}
            {(() => {
              const angle = Math.atan2(c.y - CY, c.x - CX);
              const ex = CX + Math.cos(angle) * (BOWL_HW - 4);
              const ey = CY + Math.sin(angle) * (BOWL_HH - 4);
              return (
                <line
                  x1={c.x} y1={c.y} x2={ex} y2={ey}
                  stroke={cs} strokeWidth="1.2"
                  opacity="var(--arena-connector-opacity)"
                  strokeDasharray="4 3"
                />
              );
            })()}

            {/* ── PILL NODE ── */}
            {/* Shadow/border rect */}
            <rect
              x={rx - 1} y={ry - 1}
              width={NODE_W + 2} height={NODE_H + 2}
              rx={NODE_RX + 1}
              fill="none"
              stroke={isBest ? "#c5a94e" : "var(--arena-node-stroke)"}
              strokeWidth={isBest ? 3 : 2}
              filter={isBest ? "url(#gold-glow)" : "url(#node-shadow)"}
            />

            {/* Main fill */}
            <rect
              x={rx} y={ry}
              width={NODE_W} height={NODE_H}
              rx={NODE_RX}
              fill={`url(#${faceId})`}
              filter={isHot ? "url(#node-glow)" : undefined}
              style={{ transition: "fill 0.5s ease" }}
            />

            {/* Top gloss highlight */}
            <rect
              x={rx + 6} y={ry + 2}
              width={NODE_W - 12} height={NODE_H * 0.35}
              rx={4}
              fill="rgba(255,255,255,0.2)"
            />

            {/* Bottom edge (pressed look) */}
            <line
              x1={rx + NODE_RX} y1={ry + NODE_H - 1}
              x2={rx + NODE_W - NODE_RX} y2={ry + NODE_H - 1}
              stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" strokeLinecap="round"
            />

            {/* Label — two lines: shortLabel big, section small */}
            <text
              x={c.x} y={c.y - 2}
              textAnchor="middle" dominantBaseline="middle"
              fill="#fff" fontSize="9" fontWeight="800"
              fontFamily="'JetBrains Mono', 'SF Mono', ui-monospace, monospace"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
            >
              {c.shortLabel}
            </text>
            <text
              x={c.x} y={c.y + 9}
              textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.7)" fontSize="5.5" fontWeight="600"
              fontFamily="'JetBrains Mono', 'SF Mono', ui-monospace, monospace"
            >
              SEC {c.section}
            </text>

            {/* GO HERE indicator */}
            {isBest && (
              <text x={c.x} y={goLabelY} textAnchor="middle" dominantBaseline="middle"
                fill="#c5a94e" fontSize="8" fontWeight="bold"
                fontFamily="'JetBrains Mono', 'SF Mono', ui-monospace, monospace"
                style={{ animation: "pulse-ring 1.5s ease-in-out infinite" }}>
                GO HERE
              </text>
            )}

            {/* Transaction count badge */}
            {stats && stats.perLocation[c.id] && stats.perLocation[c.id].transactionCount > 0 && (() => {
              const count = stats.perLocation[c.id].transactionCount;
              const label = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
              const bx = rx + NODE_W - 2;
              const by = ry - 2;
              return (
                <>
                  <circle cx={bx} cy={by} r={9}
                    fill="var(--arena-badge-bg)" stroke="var(--arena-badge-stroke)" strokeWidth="1.5" />
                  <text x={bx} y={by + 0.5}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="var(--arena-badge-text)" fontSize="5.5" fontWeight="800"
                    fontFamily="'JetBrains Mono', 'SF Mono', ui-monospace, monospace">
                    {label}
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}
