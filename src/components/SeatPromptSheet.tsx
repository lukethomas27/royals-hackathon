"use client";

import { useEffect, useState } from "react";

export interface DeliverySeat {
  section: string;
  row: string;
  seat: string;
}

export function isSeatComplete(seat: DeliverySeat): boolean {
  return Boolean(seat.section && seat.row.trim() && seat.seat.trim());
}

/**
 * Pops up as soon as a fan opens the delivery stand, so the seat is settled
 * before they browse. Sections come from Square (Ordering Stations, or the
 * configured fallback list); row and seat are typed, because Square only
 * publishes a truncated sample of seats per section — see square/stations.ts.
 *
 * Skippable ("Just browsing"): checkout still requires a complete seat.
 */
export default function SeatPromptSheet({
  standName,
  seat,
  validSections,
  unavailable,
  onSave,
  onClose,
}: {
  standName: string;
  seat: DeliverySeat;
  /** null while the seat config is still loading. */
  validSections: string[] | null;
  unavailable: boolean;
  onSave: (seat: DeliverySeat) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DeliverySeat>(seat);
  const complete = isSeatComplete(draft) && (validSections?.includes(draft.section) ?? false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function skip() {
    // Keep whatever they started typing; checkout picks it up from there.
    onSave(draft);
    onClose();
  }

  return (
    <div
      className="opt-sheet-backdrop"
      onClick={(e) => {
        // Rendered inside the stand panel's overlay: stop here so a backdrop
        // tap closes only this prompt, not the whole stand.
        e.stopPropagation();
        skip();
      }}
    >
      <form
        className="opt-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seat-prompt-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!complete) return;
          onSave(draft);
          onClose();
        }}
      >
        <div className="opt-sheet-head">
          <div>
            <h2 id="seat-prompt-title" className="an-display">Where are you sitting?</h2>
            <p>{standName} delivers to Fan Deck seats{validSections?.length ? ` in sections ${validSections.join(", ")}` : ""}.</p>
          </div>
          <button type="button" className="opt-sheet-close an-tap" onClick={skip} aria-label="Close seat selection">
            ×
          </button>
        </div>

        <div className="seat-prompt-fields">
          {unavailable ? (
            <p className="seat-prompt-note is-error">
              Seat data is unavailable right now. You can still browse the menu.
            </p>
          ) : (
            <>
              <label className="seat-prompt-field">
                <span className="an-label">Section</span>
                <select
                  value={draft.section}
                  onChange={(e) => setDraft({ ...draft, section: e.target.value })}
                  disabled={!validSections}
                  autoFocus
                >
                  <option value="" disabled>
                    {validSections ? "Choose" : "Loading…"}
                  </option>
                  {validSections?.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="seat-prompt-field">
                <span className="an-label">Row</span>
                <input
                  value={draft.row}
                  onChange={(e) => setDraft({ ...draft, row: e.target.value })}
                  maxLength={4}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="e.g. 4"
                />
              </label>
              <label className="seat-prompt-field">
                <span className="an-label">Seat</span>
                <input
                  value={draft.seat}
                  onChange={(e) => setDraft({ ...draft, seat: e.target.value })}
                  maxLength={4}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 12"
                />
              </label>
            </>
          )}
        </div>

        <div className="opt-sheet-foot seat-prompt-foot">
          <button type="submit" className="an-btn-primary an-tap opt-sheet-add" disabled={!complete}>
            {complete ? "Continue to menu" : "Choose your seat"}
          </button>
          <button type="button" className="seat-prompt-skip an-tap" onClick={skip}>
            Just browsing
          </button>
        </div>
      </form>
    </div>
  );
}
