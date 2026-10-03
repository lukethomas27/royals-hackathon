"use client";

import { useEffect, useRef, useState } from "react";
import { SquareCatalogItem, SquareCatalogItemVariation, SquareCatalogTax } from "@/lib/square/types";
import { isAlcoholicItem, is24ozVariation } from "@/lib/square/tax";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const MAX_QTY = 20;

/**
 * Full-screen item detail. Opens when a fan taps an item card body; the card's
 * + button still adds one directly without coming through here.
 *
 * Closes on the X, on Escape / the back gesture, and on a downward swipe.
 */
export default function ItemDetailSheet({
  item,
  taxesById,
  canOrder,
  onAdd,
  onClose,
}: {
  item: SquareCatalogItem;
  taxesById: Record<string, SquareCatalogTax>;
  canOrder: boolean;
  onAdd: (variationId: string, qty: number) => void;
  onClose: () => void;
}) {
  const sellable = item.variations.filter((v) => !v.soldOut);
  const [variationId, setVariationId] = useState<string>(sellable[0]?.id ?? item.variations[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const touchStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  const variation: SquareCatalogItemVariation | undefined =
    item.variations.find((v) => v.id === variationId) ?? item.variations[0];
  const alcoholic = isAlcoholicItem(item, taxesById);
  const unit = variation?.priceMoney?.amount ?? 0;

  // Escape and the Android/browser back gesture both close the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.history.pushState({ sheet: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [onClose]);

  return (
    <div
      className="item-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      onClick={onClose}
    >
      <div
        className="item-sheet"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchStartY.current = e.touches[0].clientY)}
        onTouchMove={(e) => {
          if (touchStartY.current === null) return;
          const dy = e.touches[0].clientY - touchStartY.current;
          if (dy > 0) setDragY(dy);
        }}
        onTouchEnd={() => {
          if (dragY > 110) onClose();
          setDragY(0);
          touchStartY.current = null;
        }}
      >
        <button type="button" className="item-sheet-close an-tap" onClick={onClose} aria-label="Close item details">
          ×
        </button>

        <div className="item-sheet-scroll">
          {item.imageUrl ? (
            <div className="item-sheet-photo photo-plate">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt="" decoding="async" />
            </div>
          ) : (
            <div className="item-sheet-photo photo-plate is-placeholder" aria-hidden="true">
              <span className="an-display">{item.name.charAt(0)}</span>
            </div>
          )}

          <div className="item-sheet-body">
            <h2 className="item-sheet-name an-display">{item.name}</h2>
            <p className="item-sheet-price an-price">{unit ? money(unit) : "—"}</p>

            {alcoholic && (
              <p className="item-sheet-19">19+ · ID checked at handoff</p>
            )}

            {item.description && <p className="item-sheet-desc">{item.description}</p>}

            {item.variations.length > 1 && (
              <div className="item-sheet-variations">
                {item.variations.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={v.soldOut}
                    onClick={() => setVariationId(v.id)}
                    className={`item-sheet-variation an-tap ${v.id === variationId ? "is-active" : ""}`}
                    aria-pressed={v.id === variationId}
                  >
                    {v.name.trim() || item.name}
                    {is24ozVariation(v) && " (limit 1)"}
                    {v.soldOut && " — sold out"}
                  </button>
                ))}
              </div>
            )}

            <div className="item-sheet-qty">
              <span className="an-label">Quantity</span>
              <div className="item-sheet-stepper">
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
            </div>
          </div>
        </div>

        <div className="item-sheet-foot">
          <button
            type="button"
            className="an-btn-primary an-tap w-full"
            disabled={!canOrder || !variation || variation.soldOut}
            onClick={() => {
              if (!variation) return;
              onAdd(variation.id, qty);
              onClose();
            }}
            aria-label={`Add ${qty} ${item.name} to cart, ${money(unit * qty)}`}
          >
            {canOrder ? `Add · ${money(unit * qty)}` : "Stand closed"}
          </button>
          <p className="item-sheet-taxnote">Tax calculated at checkout</p>
        </div>
      </div>
    </div>
  );
}
