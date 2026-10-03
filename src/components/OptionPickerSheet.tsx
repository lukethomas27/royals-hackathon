"use client";

import { useEffect, useState } from "react";
import { SquareCatalogItem, SquareCatalogTax } from "@/lib/square/types";
import { isAlcoholicItem, is24ozVariation } from "@/lib/square/tax";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const MAX_QTY = 20;

/**
 * Bottom-sheet popup opened by a menu card's + when the item has more than one
 * option (Square variation) — size, flavour, brand. Nothing is pre-selected:
 * the point of the popup is that the fan picks, instead of the + silently
 * adding whichever variation Square happens to list first.
 *
 * Closes on the X, the backdrop, or Escape.
 */
export default function OptionPickerSheet({
  item,
  taxesById,
  onAdd,
  onClose,
}: {
  item: SquareCatalogItem;
  taxesById: Record<string, SquareCatalogTax>;
  onAdd: (variationId: string, qty: number) => void;
  onClose: () => void;
}) {
  const [variationId, setVariationId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const variation = item.variations.find((v) => v.id === variationId) ?? null;
  const unit = variation?.priceMoney?.amount ?? 0;
  const alcoholic = isAlcoholicItem(item, taxesById);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="opt-sheet-backdrop"
      onClick={(e) => {
        // Rendered inside the stand panel's overlay: stop here so a backdrop
        // tap closes only this popup, not the whole stand.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="opt-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="opt-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="opt-sheet-head">
          <div>
            <h2 id="opt-sheet-title" className="an-display">{item.name}</h2>
            <p>
              Choose an option{alcoholic ? " · 19+, ID checked at handoff" : ""}
            </p>
          </div>
          <button type="button" className="opt-sheet-close an-tap" onClick={onClose} aria-label="Close options">
            ×
          </button>
        </div>

        <div className="opt-sheet-list" role="radiogroup" aria-label={`${item.name} options`}>
          {item.variations.map((v) => {
            const selected = v.id === variationId;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={v.soldOut}
                onClick={() => setVariationId(v.id)}
                className={`opt-row an-tap ${selected ? "is-selected" : ""}`}
              >
                <span className="opt-row-radio" aria-hidden="true" />
                <span className="opt-row-name">
                  {v.name.trim() || item.name}
                  {is24ozVariation(v) && <span className="opt-row-note"> · limit 1 per order</span>}
                  {v.soldOut && <span className="opt-row-note"> · sold out</span>}
                </span>
                <span className="opt-row-price an-price">{v.priceMoney ? money(v.priceMoney.amount) : "—"}</span>
              </button>
            );
          })}
        </div>

        <div className="opt-sheet-foot">
          <div className="item-sheet-stepper" aria-label="Quantity">
            <button
              type="button"
              className="an-tap"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span aria-live="polite">{qty}</span>
            <button
              type="button"
              className="an-tap"
              onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
              disabled={qty >= MAX_QTY}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="an-btn-primary an-tap opt-sheet-add"
            disabled={!variation || variation.soldOut}
            onClick={() => {
              if (!variation) return;
              onAdd(variation.id, qty);
              onClose();
            }}
            aria-label={variation ? `Add ${qty} ${variation.name.trim() || item.name} to cart` : "Choose an option first"}
          >
            {variation ? `Add · ${money(unit * qty)}` : "Choose an option"}
          </button>
        </div>
      </div>
    </div>
  );
}
