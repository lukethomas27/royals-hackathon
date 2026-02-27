"use client";

import { MenuItem, estimateWaitMinutes } from "@/lib/vendorMenu";

interface VendorDetailProps {
  name: string;
  shortLabel: string;
  heat: number;
  items: MenuItem[];
  onClose: () => void;
}

function heatLabel(heat: number): { text: string; color: string } {
  if (heat < 0.25) return { text: "Not busy", color: "#22c55e" };
  if (heat < 0.5) return { text: "Moderate", color: "#eab308" };
  if (heat < 0.75) return { text: "Busy", color: "#f97316" };
  return { text: "Very busy", color: "#ef4444" };
}

function fanCategory(dataCategory: string): string {
  switch (dataCategory) {
    case "Food": return "Food";
    case "Beer": return "Beer";
    case "Wine, Cider & Coolers":
    case "Liquor": return "Drinks";
    case "NA Bev":
    case "NA Bev PST Exempt": return "Non-Alcoholic";
    case "Snack":
    case "Snacks": return "Snacks";
    case "Sweets": return "Sweets";
    default: return dataCategory;
  }
}

export default function VendorDetail({ name, shortLabel, heat, items, onClose }: VendorDetailProps) {
  const waitMin = estimateWaitMinutes(heat);
  const status = heatLabel(heat);

  const grouped: Record<string, MenuItem[]> = {};
  for (const item of items) {
    const cat = fanCategory(item.category);
    if (!(cat in grouped)) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const categoryOrder = ["Food", "Beer", "Drinks", "Non-Alcoholic", "Snacks", "Sweets"];
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Panel */}
      <div
        className="relative w-full max-w-md rounded-t-2xl px-5 pt-4 pb-6 max-h-[75vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--panel-bg)",
          borderTop: "1px solid var(--panel-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border-default)" }} />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{name}</h2>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{shortLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-xl leading-none p-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            &times;
          </button>
        </div>

        {/* Status bar */}
        <div
          className="flex items-center justify-between rounded-lg px-4 py-3 mb-4"
          style={{ backgroundColor: "var(--bg-elevated)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: status.color }}
            />
            <span className="text-sm font-semibold" style={{ color: status.color }}>
              {status.text}
            </span>
          </div>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            ~{waitMin} min wait
          </span>
        </div>

        {/* Heat bar */}
        <div className="mb-5">
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--heat-bar-bg)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(heat * 100, 2)}%`,
                background: `linear-gradient(to right, #22c55e, ${status.color})`,
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>

        {/* Menu */}
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>Menu</h3>
        {sortedCategories.map((cat) => (
          <div key={cat} className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-tertiary)" }}>
              {cat}
            </p>
            {grouped[cat].map((item) => (
              <div
                key={item.name}
                className="flex justify-between py-1.5 border-b"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>{item.name}</span>
                {item.price > 0 && (
                  <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                    ${item.price.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}

        <p className="text-[10px] mt-3 text-center" style={{ color: "var(--text-tertiary)" }}>
          Prices are estimates. Wait time based on historical data.
        </p>
      </div>
    </div>
  );
}
