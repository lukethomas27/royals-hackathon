"use client";

import { useEffect, useMemo, useState } from "react";
import { SquareCatalogItem, SquareCatalogTax } from "@/lib/square/types";
import { isAlcoholicItem, is24ozVariation, validateAlcoholLimits, CartLine, estimateLineTax } from "@/lib/square/tax";
import { MapStand } from "./ArenaMap";

interface OrderPanelProps {
  stand: MapStand;
  heat: number;
  onClose: () => void;
}

function heatLabel(heat: number): { text: string; color: string } {
  if (heat < 0.25) return { text: "Not busy", color: "#22c55e" };
  if (heat < 0.5) return { text: "Moderate", color: "#eab308" };
  if (heat < 0.75) return { text: "Busy", color: "#f97316" };
  return { text: "Very busy", color: "#ef4444" };
}

function estimateWaitMinutes(heat: number): number {
  return Math.round(heat * 15);
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type Phase = "menu" | "checkout" | "confirmation";

interface SeatConfig {
  mode: "live" | "fallback";
  validSections: string[];
}

export default function OrderPanel({ stand, heat, onClose }: OrderPanelProps) {
  const [items, setItems] = useState<SquareCatalogItem[]>([]);
  const [taxesById, setTaxesById] = useState<Record<string, SquareCatalogTax>>({});
  const [menuSource, setMenuSource] = useState<"live" | "mock" | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [phase, setPhase] = useState<Phase>("menu");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [seatConfig, setSeatConfig] = useState<SeatConfig | null>(null);
  const [seat, setSeat] = useState({ section: "", row: "", seat: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [requiresIdCheck, setRequiresIdCheck] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/menu?locationId=${encodeURIComponent(stand.locationId)}`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setTaxesById(data.taxesById ?? {});
        setMenuSource(data.source ?? null);
      })
      .finally(() => setLoading(false));

    if (stand.role === "in_seat") {
      fetch("/api/seat-config")
        .then((r) => r.json())
        .then((cfg: SeatConfig) => setSeatConfig(cfg));
    }
  }, [stand.locationId, stand.role]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SquareCatalogItem[]>();
    for (const item of items) {
      const key = item.categoryName ?? "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }, [items]);

  const status = heatLabel(heat);
  const waitMin = estimateWaitMinutes(heat);

  function addToCart(item: SquareCatalogItem, variationId: string) {
    const variation = item.variations.find((v) => v.id === variationId);
    if (!variation) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.variation.id === variationId);
      if (existing) {
        return prev.map((l) => (l.variation.id === variationId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { item, variation, quantity: 1 }];
    });
  }

  function changeQty(variationId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.variation.id === variationId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  const alcoholCheck = validateAlcoholLimits(cart, taxesById);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of cart) {
      const lineSubtotal = (line.variation.priceMoney?.amount ?? 0) * line.quantity;
      subtotal += lineSubtotal;
      tax += estimateLineTax(line.item, lineSubtotal, taxesById).totalTaxCents;
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [cart, taxesById]);

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);

  async function submitOrder() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: stand.locationId,
          customerPhone: phone,
          smsOptIn,
          lines: cart.map((l) => ({ itemId: l.item.id, variationId: l.variation.id, quantity: l.quantity })),
          seat: stand.role === "in_seat" ? seat : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong placing the order.");
        return;
      }
      setOrderId(data.orderId);
      setRequiresIdCheck(data.requiresIdCheck);
      setPhase("confirmation");
    } catch {
      setError("Couldn't reach the order system. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-t-2xl px-5 pt-4 pb-6 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--panel-bg)", borderTop: "1px solid var(--panel-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border-default)" }} />
        </div>

        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{stand.displayName}</h2>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {stand.role === "in_seat" ? "Delivery to seat" : "Pickup"}
              {!stand.isOpen && " · Not accepting online orders right now"}
            </p>
          </div>
          <button onClick={onClose} className="text-xl leading-none p-1" style={{ color: "var(--text-tertiary)" }}>&times;</button>
        </div>

        {!stand.isOpen && (
          <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ backgroundColor: "var(--heat-bar-bg)", color: "var(--text-secondary)" }}>
            This stand has closed online ordering for now.
          </div>
        )}

        {phase === "menu" && (
          <>
            <div className="flex items-center justify-between rounded-lg px-4 py-3 mb-4" style={{ backgroundColor: "var(--bg-elevated)" }}>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                <span className="text-sm font-semibold" style={{ color: status.color }}>{status.text}</span>
              </div>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>~{waitMin} min wait</span>
            </div>

            {menuSource === "mock" && (
              <div className="text-[10px] mb-3 px-2 py-1 rounded inline-block" style={{ backgroundColor: "var(--heat-bar-bg)", color: "var(--text-tertiary)" }}>
                DEMO MENU — not live Square data (no SQUARE_ACCESS_TOKEN configured)
              </div>
            )}

            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>Menu</h3>

            {loading && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading menu…</p>}
            {!loading && items.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Nothing orderable here right now.</p>
            )}

            {Array.from(grouped.entries()).map(([cat, catItems]) => (
              <div key={cat} className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>{cat}</p>
                {catItems.map((item) => {
                  const alcoholic = isAlcoholicItem(item, taxesById);
                  return (
                    <div key={item.id} className="py-1.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.name}</span>
                        {alcoholic && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ backgroundColor: "var(--heat-bar-bg)", color: "var(--text-tertiary)" }}>
                            19+ · ID CHECKED
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {item.variations.map((v) => (
                          <div key={v.id} className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                              {v.name}
                              {is24ozVariation(v) && " (limit 1)"}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                {v.priceMoney ? money(v.priceMoney.amount) : "—"}
                              </span>
                              <button
                                type="button"
                                disabled={!stand.isOpen}
                                onClick={() => addToCart(item, v.id)}
                                className="btn-add text-xs font-semibold px-2.5 py-1 rounded"
                                aria-label={`Add ${item.name} ${v.name}`}
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {cartCount > 0 && (
              <button
                onClick={() => setPhase("checkout")}
                className="w-full mt-2 py-3 rounded-lg font-semibold"
                style={{ backgroundColor: "var(--accent-gold)", color: "var(--text-inverted)" }}
              >
                View cart ({cartCount}) · {money(totals.total)}
              </button>
            )}
          </>
        )}

        {phase === "checkout" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Your order</h3>
              {cart.map((l) => (
                <div key={l.variation.id} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  <div>
                    <div className="text-sm" style={{ color: "var(--text-primary)" }}>{l.item.name} — {l.variation.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{l.variation.priceMoney ? money(l.variation.priceMoney.amount) : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => changeQty(l.variation.id, -1)} className="btn-qty w-6 h-6 rounded" aria-label="Remove one">−</button>
                    <span className="text-sm w-4 text-center">{l.quantity}</span>
                    <button type="button" onClick={() => changeQty(l.variation.id, 1)} className="btn-qty w-6 h-6 rounded" aria-label="Add one">+</button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-2" style={{ color: "var(--text-secondary)" }}>
                <span>Subtotal</span><span>{money(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm" style={{ color: "var(--text-tertiary)" }}>
                <span>Est. tax</span><span>{money(totals.tax)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                <span>Total</span><span>{money(totals.total)}</span>
              </div>
              <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                Tax shown is an estimate. Tips, fees and the final total are calculated by Square at checkout.
              </p>
            </div>

            {!alcoholCheck.ok && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                {alcoholCheck.reason}
              </div>
            )}
            {alcoholCheck.ok && alcoholCheck.requiresIdCheck && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                This order contains alcohol — have ID ready at {stand.role === "in_seat" ? "delivery" : "pickup"}.
              </div>
            )}

            {stand.role === "in_seat" && (
              <div>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Where should we deliver?</h3>
                {seatConfig?.mode === "fallback" && (
                  <p className="text-[10px] mb-2" style={{ color: "var(--text-tertiary)" }}>
                    Delivery is only available in sections {seatConfig.validSections.join(", ")}.
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <input placeholder="Section" value={seat.section} onChange={(e) => setSeat({ ...seat, section: e.target.value })}
                    className="rounded px-2 py-2 text-sm border" style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                  <input placeholder="Row" value={seat.row} onChange={(e) => setSeat({ ...seat, row: e.target.value })}
                    className="rounded px-2 py-2 text-sm border" style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                  <input placeholder="Seat" value={seat.seat} onChange={(e) => setSeat({ ...seat, seat: e.target.value })}
                    className="rounded px-2 py-2 text-sm border" style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Get order updates</h3>
              <input
                type="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm border mb-2"
                style={{ backgroundColor: "var(--bg-input)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
              />
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
                Text me when my order is ready. No account needed.
              </label>
            </div>

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setPhase("menu")} className="flex-1 py-3 rounded-lg font-semibold" style={{ backgroundColor: "var(--btn-bg)", color: "var(--btn-text)" }}>
                Back
              </button>
              <button
                onClick={submitOrder}
                disabled={submitting || !alcoholCheck.ok || !phone || (stand.role === "in_seat" && (!seat.section || !seat.row || !seat.seat))}
                className="flex-1 py-3 rounded-lg font-semibold"
                style={{ backgroundColor: "var(--accent-gold)", color: "var(--text-inverted)", opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? "Placing order…" : `Place order · ${money(totals.total)}`}
              </button>
            </div>
            <p className="text-[10px] text-center" style={{ color: "var(--text-tertiary)" }}>
              Payment capture isn&apos;t wired up in this build yet — see STATUS.md. This creates the Square order without charging a card.
            </p>
          </div>
        )}

        {phase === "confirmation" && (
          <div className="text-center py-6">
            <p className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Order received</p>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              We received your order. We&apos;ll text you when it&apos;s ready.
            </p>
            {requiresIdCheck && (
              <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
                Have your ID ready — this order includes alcohol.
              </p>
            )}
            <p className="text-[10px] mb-4" style={{ color: "var(--text-tertiary)" }}>Order ref: {orderId}</p>
            <button onClick={onClose} className="py-2 px-4 rounded-lg font-semibold" style={{ backgroundColor: "var(--btn-bg)", color: "var(--btn-text)" }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
