"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SquareCatalogItem, SquareCatalogTax } from "@/lib/square/types";
import { isAlcoholicItem, is24ozVariation, validateAlcoholLimits, CartLine, estimateLineTax } from "@/lib/square/tax";
import { MapStand } from "./ArenaMap";

// Display order for live category names (Square reporting categories).
// Matching is fuzzy on purpose — names are Eventium's and may be renamed.
// Unmatched categories render after these in the order Square returned them.
const CATEGORY_DISPLAY_ORDER: RegExp[] = [
  /^food/i,
  /^snack/i,
  /^sweet/i,
  /^beer/i,
  /wine|cider|cooler/i,
  /^liquor/i,
  /^na bev(?! pst)/i,
  /^na bev pst/i,
  /^extra/i,
  /^other$/i,
];

/** Public config the server hands the browser for the Web Payments SDK. */
export interface SquareClientConfig {
  configured: boolean; // server has an access token (else mock mode)
  applicationId: string | null;
  environment: "sandbox" | "production";
}

// --- Minimal typing for the Square Web Payments SDK (loaded from Square's CDN) ---
interface SquareTokenResult {
  status: string;
  token?: string;
  errors?: { message?: string }[];
}
interface SquareCard {
  attach(selector: string): Promise<void>;
  tokenize(verificationDetails?: unknown): Promise<SquareTokenResult>;
  destroy(): Promise<void>;
}
interface SquarePayments {
  card(options?: unknown): Promise<SquareCard>;
}
interface SquareSdk {
  payments(applicationId: string, locationId: string): SquarePayments;
}
declare global {
  interface Window {
    Square?: SquareSdk;
  }
}

function sdkUrl(env: "sandbox" | "production"): string {
  return env === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";
}

function loadSquareSdk(env: "sandbox" | "production"): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Square) return Promise.resolve();
  const src = sdkUrl(env);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Square SDK failed to load")));
      if (window.Square) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Square SDK failed to load"));
    document.head.appendChild(s);
  });
}

interface OrderPanelProps {
  stand: MapStand;
  heat: number;
  square: SquareClientConfig | null;
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
  mode: "live" | "fallback" | "unavailable";
  validSections: string[];
}

interface Confirmation {
  orderId: string;
  paidWith: "card" | "promo" | "mock";
  amount: { amount: number; currency: string };
  receiptUrl: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  requiresIdCheck: boolean;
}

const inputStyle = {
  backgroundColor: "var(--bg-input)",
  borderColor: "var(--border-default)",
  color: "var(--text-primary)",
} as const;

export default function OrderPanel({ stand, heat, square, onClose }: OrderPanelProps) {
  const [items, setItems] = useState<SquareCatalogItem[]>([]);
  const [taxesById, setTaxesById] = useState<Record<string, SquareCatalogTax>>({});
  const [menuSource, setMenuSource] = useState<"live" | "mock" | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [phase, setPhase] = useState<Phase>("menu");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [seatConfig, setSeatConfig] = useState<SeatConfig | null>(null);
  const [seat, setSeat] = useState({ section: "", row: "", seat: "" });
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<string | null>(null);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Card entry (Square Web Payments SDK)
  const cardRef = useRef<SquareCard | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  // Payments are possible when the server has a token AND an app ID. With no
  // token (mock mode) the server fakes the payment, so no card is asked for.
  const paymentsEnabled = Boolean(square?.configured && square.applicationId);
  const paymentsBroken = Boolean(square?.configured && !square.applicationId);
  const needsCard = paymentsEnabled && !promoApplied;

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

  // Mount Square's hosted card field whenever checkout needs one.
  useEffect(() => {
    if (phase !== "checkout" || !needsCard || !square?.applicationId) return;
    let cancelled = false;
    let instance: SquareCard | null = null;
    setCardReady(false);
    setCardError(null);
    (async () => {
      try {
        await loadSquareSdk(square.environment);
        if (cancelled || !window.Square) return;
        const payments = window.Square.payments(square.applicationId!, stand.locationId);
        const card = await payments.card({
          style: {
            input: { color: "#1a1a1a", fontSize: "16px" },
            ".input-container": { borderColor: "#c5a94e", borderRadius: "8px" },
            ".input-container.is-focus": { borderColor: "#c5a94e" },
            ".message-text": { color: "#6b7280" },
            ".message-text.is-error": { color: "#ef4444" },
          },
        });
        if (cancelled) {
          await card.destroy();
          return;
        }
        await card.attach("#sq-card-container");
        instance = card;
        cardRef.current = card;
        setCardReady(true);
      } catch (err) {
        console.error("[OrderPanel] card form failed to load", err);
        if (!cancelled) setCardError("Could not load the card form. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
      cardRef.current = null;
      setCardReady(false);
      if (instance) instance.destroy().catch(() => {});
    };
  }, [phase, needsCard, square?.applicationId, square?.environment, stand.locationId]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SquareCatalogItem[]>();
    for (const item of items) {
      const key = item.categoryName ?? "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    // Square returns items in catalog order, which puts "NA Bev PST Exempt"
    // first. Present food first, then snacks, then drinks; any category name
    // we don't recognise keeps its live order after those.
    const rank = (name: string) => {
      const i = CATEGORY_DISPLAY_ORDER.findIndex((re) => re.test(name));
      return i === -1 ? CATEGORY_DISPLAY_ORDER.length : i;
    };
    return new Map([...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)));
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
    if (promoApplied) return { subtotal, discount: subtotal, tax: 0, total: 0 };
    return { subtotal, discount: 0, tax, total: subtotal + tax };
  }, [cart, taxesById, promoApplied]);

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);

  async function applyPromo() {
    const code = promoInput.trim();
    setPromoMessage(null);
    if (!code) return;
    try {
      const res = await fetch(`/api/promo?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.valid) {
        setPromoApplied(code.toUpperCase());
        setPromoMessage("Code applied. No payment needed for this order.");
      } else {
        setPromoApplied(null);
        setPromoMessage("That code is not valid.");
      }
    } catch {
      setPromoMessage("Could not check that code. Try again.");
    }
  }

  function clearPromo() {
    setPromoApplied(null);
    setPromoInput("");
    setPromoMessage(null);
  }

  async function submitOrder() {
    setError(null);
    setSubmitting(true);
    try {
      let sourceId: string | null = null;
      if (needsCard) {
        const card = cardRef.current;
        if (!card) {
          setError("The card form is not ready yet.");
          return;
        }
        // verificationDetails lets Square run SCA / 3-D Secure when the
        // issuer demands it. The amount is the estimate; Square charges the
        // order's real total server-side.
        let result: SquareTokenResult;
        try {
          result = await card.tokenize({
            amount: (totals.total / 100).toFixed(2),
            currencyCode: "CAD",
            intent: "CHARGE",
            customerInitiated: true,
            sellerKeyedIn: false,
            billingContact: name.trim() ? { givenName: name.trim() } : {},
          });
        } catch {
          result = await card.tokenize();
        }
        if (result.status !== "OK" || !result.token) {
          setError(result.errors?.[0]?.message ?? "Check the card details and try again.");
          return;
        }
        sourceId = result.token;
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: stand.locationId,
          customerPhone: phone,
          recipientName: name.trim() || null,
          smsOptIn,
          lines: cart.map((l) => ({ itemId: l.item.id, variationId: l.variation.id, quantity: l.quantity })),
          seat: stand.role === "in_seat" ? seat : null,
          sourceId,
          promoCode: promoApplied,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong placing the order.");
        return;
      }
      setConfirmation({
        orderId: data.orderId,
        paidWith: data.paidWith,
        amount: data.amount,
        receiptUrl: data.receiptUrl ?? null,
        cardBrand: data.cardBrand ?? null,
        cardLast4: data.cardLast4 ?? null,
        requiresIdCheck: Boolean(data.requiresIdCheck),
      });
      setPhase("confirmation");
    } catch {
      setError("Could not reach the order system. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const seatIncomplete =
    stand.role === "in_seat" && (seatConfig?.mode === "unavailable" || !seat.section || !seat.row || !seat.seat);
  const placeDisabled =
    submitting ||
    !alcoholCheck.ok ||
    !phone ||
    seatIncomplete ||
    paymentsBroken ||
    (needsCard && (!cardReady || Boolean(cardError)));

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
                              {/* Some live variations have an empty name (e.g. Chicken Tenders) */}
                              {v.name.trim() || item.name}
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
                                aria-label={`Add ${item.name} ${v.name.trim() || item.name}`}
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
                    <div className="text-sm" style={{ color: "var(--text-primary)" }}>{l.item.name} — {l.variation.name.trim() || l.item.name}</div>
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
              {promoApplied && (
                <div className="flex justify-between text-sm" style={{ color: "#16a34a" }}>
                  <span>Code {promoApplied}</span><span>−{money(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm" style={{ color: "var(--text-tertiary)" }}>
                <span>Est. tax</span><span>{money(totals.tax)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                <span>Total</span><span>{money(totals.total)}</span>
              </div>
              <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                Tax shown is an estimate. The final total is calculated by Square and shown on your receipt.
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
                {seatConfig?.mode === "unavailable" && (
                  <p className="text-[10px] mb-2" style={{ color: "#ef4444" }}>
                    Live seat data is temporarily unavailable. Please try again or choose pickup.
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <input placeholder="Section" value={seat.section} onChange={(e) => setSeat({ ...seat, section: e.target.value })}
                    className="rounded px-2 py-2 text-sm border" style={inputStyle} />
                  <input placeholder="Row" value={seat.row} onChange={(e) => setSeat({ ...seat, row: e.target.value })}
                    className="rounded px-2 py-2 text-sm border" style={inputStyle} />
                  <input placeholder="Seat" value={seat.seat} onChange={(e) => setSeat({ ...seat, seat: e.target.value })}
                    className="rounded px-2 py-2 text-sm border" style={inputStyle} />
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                {stand.role === "in_seat" ? "Who is it for?" : "Name for pickup"}
              </h3>
              <input
                type="text"
                placeholder="First name (optional)"
                value={name}
                maxLength={40}
                autoComplete="given-name"
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm border mb-2"
                style={inputStyle}
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={phone}
                autoComplete="tel"
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm border mb-2"
                style={inputStyle}
              />
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
                Text me when my order is ready. No account needed.
              </label>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Promo code</h3>
              {promoApplied ? (
                <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#16a34a" }}>
                  <span>{promoApplied} applied</span>
                  <button type="button" onClick={clearPromo} className="text-xs underline" style={{ color: "var(--text-tertiary)" }}>Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Have a code?"
                    value={promoInput}
                    autoCapitalize="characters"
                    onChange={(e) => setPromoInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyPromo(); }}
                    className="flex-1 rounded px-3 py-2 text-sm border"
                    style={inputStyle}
                  />
                  <button type="button" onClick={applyPromo} disabled={!promoInput.trim()} className="btn-qty px-3 rounded text-sm font-semibold">
                    Apply
                  </button>
                </div>
              )}
              {promoMessage && (
                <p className="text-xs mt-1" style={{ color: promoApplied ? "#16a34a" : "#ef4444" }}>{promoMessage}</p>
              )}
            </div>

            {needsCard && (
              <div>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Card</h3>
                <div className="rounded-lg p-3" style={{ backgroundColor: "#ffffff" }}>
                  <div id="sq-card-container" />
                  {!cardReady && !cardError && (
                    <p className="text-xs" style={{ color: "#6b7280" }}>Loading secure card form…</p>
                  )}
                </div>
                {cardError && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{cardError}</p>}
                <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                  Card details go straight to Square. This app never sees your card number.
                </p>
              </div>
            )}
            {paymentsBroken && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                Online payment is not available right now. Please order at the counter.
              </div>
            )}
            {!paymentsEnabled && !paymentsBroken && !promoApplied && (
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                DEMO MODE — no card is charged and nothing is sent to Square.
              </p>
            )}

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
                disabled={placeDisabled}
                className="flex-1 py-3 rounded-lg font-semibold"
                style={{ backgroundColor: "var(--accent-gold)", color: "var(--text-inverted)", opacity: placeDisabled ? 0.6 : 1 }}
              >
                {submitting ? "Placing order…" : needsCard ? `Pay ${money(totals.total)}` : `Place order · ${money(totals.total)}`}
              </button>
            </div>
            <p className="text-[10px] text-center" style={{ color: "var(--text-tertiary)" }}>
              Payments are processed by Square. Your order goes straight to the stand once it is paid.
            </p>
          </div>
        )}

        {phase === "confirmation" && confirmation && (
          <div className="text-center py-6">
            <p className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Order received</p>
            <p className="text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
              {confirmation.paidWith === "card" && confirmation.cardLast4
                ? `Paid ${money(confirmation.amount.amount)} · ${confirmation.cardBrand ?? "Card"} ····${confirmation.cardLast4}`
                : confirmation.paidWith === "promo"
                  ? "Paid with promo code · $0.00"
                  : `Total ${money(confirmation.amount.amount)}`}
            </p>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              {name.trim() ? `${name.trim()}, we` : "We"} have sent your order to {stand.displayName}.
              {stand.role === "in_seat" ? ` It is on its way to section ${seat.section}, row ${seat.row}, seat ${seat.seat}.` : " We will text you when it is ready."}
            </p>
            {confirmation.requiresIdCheck && (
              <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
                Have your ID ready — this order includes alcohol.
              </p>
            )}
            {confirmation.receiptUrl && (
              <p className="text-xs mb-3">
                <a href={confirmation.receiptUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent-gold)" }}>
                  View Square receipt
                </a>
              </p>
            )}
            <p className="text-[10px] mb-4" style={{ color: "var(--text-tertiary)" }}>Order ref: {confirmation.orderId}</p>
            <button onClick={onClose} className="py-2 px-4 rounded-lg font-semibold" style={{ backgroundColor: "var(--btn-bg)", color: "var(--btn-text)" }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
