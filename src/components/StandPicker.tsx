"use client";

import { MapStand } from "./ArenaMap";

interface StandPickerProps {
  stands: MapStand[];
  inSeatSection: string;
  onPick: (locationId: string) => void;
  onClose: () => void;
}

/**
 * The obvious way in: "Order food" opens this, a fan picks a stand, and the
 * menu opens. Tapping a stand on the arena map still opens the menu directly,
 * so this is an addition, not a replacement.
 *
 * Closed stands are listed rather than hidden — a fan should be able to see
 * what a stand sells before it opens. The menu refuses to add items when the
 * stand is closed, exactly as it does from the map.
 */
export default function StandPicker({ stands, inSeatSection, onPick, onClose }: StandPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-t-2xl px-5 pt-4 pb-6 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--bg-sheet, var(--bg-elevated))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border-default)" }} />
        </div>

        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              Where are you ordering from?
            </h2>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Pick a stand to see its menu
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none p-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            &times;
          </button>
        </div>

        {stands.length === 0 && (
          <p className="text-sm py-6 text-center" style={{ color: "var(--text-tertiary)" }}>
            No stands are available right now.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {stands.map((s) => (
            <button
              key={s.locationId}
              type="button"
              onClick={() => onPick(s.locationId)}
              className="stand-pick"
            >
              <span className="stand-pick-copy">
                <strong>{s.fanName ?? s.displayName}</strong>
                <small>
                  {s.role === "in_seat" ? `Delivered to your seat · section ${inSeatSection} area` : "Pick up at the stand"}
                </small>
              </span>
              <span className="stand-pick-state">
                <span className={s.isOpen ? "stand-pick-open" : "stand-pick-closed"}>
                  {s.isOpen ? "Open" : "Closed"}
                </span>
                <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
