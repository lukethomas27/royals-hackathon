"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SquareCatalogItem, SquareCatalogTax, SquareOrderQuote } from "@/lib/square/types";
import { isAlcoholicItem, validateAlcoholLimits, CartLine } from "@/lib/square/tax";
import { MapStand } from "./ArenaMap";
import { StandBusyness } from "@/lib/square/busyness";
import BusynessMeter from "./BusynessMeter";
import ItemDetailSheet from "./ItemDetailSheet";
import OptionPickerSheet from "./OptionPickerSheet";
import { primeChime, TrackedOrder } from "@/lib/trackedOrders";

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
  /** Live busyness for this stand. null while it loads. */
  busyness?: StandBusyness | null;
  /** The cart lives in the page so the sticky bar can show it. */
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  /** Tells the page which stand the current cart belongs to. */
  onCartStandChange: (locationId: string | null) => void;
  square: SquareClientConfig | null;
  onClose: () => void;
  /** Paid and sent to the stand. The page takes over with the live tracker. */
  onOrderPlaced: (order: TrackedOrder) => void;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type Phase = "menu" | "checkout";

interface SeatConfig {
  mode: "live" | "fallback" | "unavailable";
  validSections: string[];
}

const inputStyle = {
  backgroundColor: "var(--bg-input)",
  borderColor: "var(--border-default)",
  color: "var(--text-primary)",
} as const;

export default function OrderPanel({
  stand,
  heat,
  busyness,
  cart,
  setCart,
  onCartStandChange,
  square,
  onClose,
  onOrderPlaced,
}: OrderPanelProps) {
  const [items, setItems] = useState<SquareCatalogItem[]>([]);
  const [taxesById, setTaxesById] = useState<Record<string, SquareCatalogTax>>({});
  const [menuSource, setMenuSource] = useState<"live" | "mock" | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("menu");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [seatConfig, setSeatConfig] = useState<SeatConfig | null>(null);
  const [seat, setSeat] = useState({ section: "", row: "", seat: "" });
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<string | null>(null);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Card entry (Square Web Payments SDK)
  const cardRef = useRef<SquareCard | null>(null);
  const [cardReady, setCardReady] = useState(false);
  // The quote is stored with the cart key it was priced for, so a stale total
  // can never sit next to a changed cart — and so the effect below never has
  // to call setState synchronously in its body.
  const [quoteState, setQuoteState] = useState<{ key: string; quote: SquareOrderQuote | null; error: string | null } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
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
        // Arena Night. Square renders the card field in its own iframe, so it
        // cannot inherit our CSS — these values mirror the palette by hand.
        // 16px keeps iOS from zooming the page on focus.
        const card = await payments.card({
          style: {
            input: { color: "#F3F5F8", fontSize: "16px", backgroundColor: "#101B2F" },
            "input::placeholder": { color: "#A9B4C6" },
            ".input-container": { borderColor: "#22304D", borderRadius: "10px", backgroundColor: "#101B2F" },
            ".input-container.is-focus": { borderColor: "#7CC4FF" },
            ".input-container.is-error": { borderColor: "#ef4444" },
            ".message-text": { color: "#A9B4C6" },
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

  // Live busyness when we have it, otherwise the simulated heat (dev only).
  // No wait estimate: this account gives no queue depth and no prep times —
  // see src/lib/square/busyness.ts.
  const liveHeat = busyness ? (busyness.state === "live" ? busyness.heat : null) : heat;

  /**
   * Last add, so the card can flash and the header cart can bump. The nonce
   * restarts the animation when the same item is added twice in a row.
   */
  const [justAdded, setJustAdded] = useState<{ itemId: string; nonce: number } | null>(null);
  const [addedAnnouncement, setAddedAnnouncement] = useState("");
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), 900);
    return () => clearTimeout(t);
  }, [justAdded]);

  function addToCart(item: SquareCatalogItem, variationId: string, qty = 1) {
    const variation = item.variations.find((v) => v.id === variationId);
    if (!variation) return;
    setJustAdded((prev) => ({ itemId: item.id, nonce: (prev?.nonce ?? 0) + 1 }));
    const optionName = item.variations.length > 1 && variation.name.trim() ? ` (${variation.name.trim()})` : "";
    setAddedAnnouncement(`Added ${qty} ${item.name}${optionName} to your cart.`);
    // The page tracks which stand the cart belongs to; an order can only ever
    // go to one Square location.
    onCartStandChange(stand.locationId);
    setCart((prev) => {
      const existing = prev.find((l) => l.variation.id === variationId);
      if (existing) {
        return prev.map((l) =>
          l.variation.id === variationId ? { ...l, quantity: Math.min(20, l.quantity + qty) } : l
        );
      }
      return [...prev, { item, variation, quantity: Math.min(20, qty) }];
    });
  }

  const categoryNames = Array.from(grouped.keys());
  const [menuCategory, setMenuCategory] = useState<string | null>(null);

  /** Stand must be open before anything can be added. */
  const canOrder = stand.isOpen;

  /** Item tapped for its detail sheet (the + button adds directly instead). */
  const [detailItem, setDetailItem] = useState<SquareCatalogItem | null>(null);
  /** Item whose + opened the option popup (only items with 2+ options). */
  const [pickerItem, setPickerItem] = useState<SquareCatalogItem | null>(null);

  /**
   * The card's +. One option: straight into the cart. Several: the fan picks
   * in a popup — never silently the first variation Square lists.
   */
  function onAddPress(item: SquareCatalogItem) {
    const sellable = item.variations.filter((v) => !v.soldOut);
    if (sellable.length === 0) return;
    if (item.variations.length > 1) {
      setPickerItem(item);
      return;
    }
    addToCart(item, sellable[0].id);
  }

  function changeQty(variationId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.variation.id === variationId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  const alcoholCheck = validateAlcoholLimits(cart, taxesById);

  // The running figure in the menu is a sum of Square's own prices. No tax is
  // calculated anywhere in this app — the checkout total comes from Square.
  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + (l.variation.priceMoney?.amount ?? 0) * l.quantity, 0),
    [cart]
  );

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const qtyByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.item.id, (m.get(l.item.id) ?? 0) + l.quantity);
    return m;
  }, [cart]);
  const cartKey = cart.map((l) => `${l.variation.id}x${l.quantity}`).join(",");
  const quoteKey = `${cartKey}|${promoApplied ?? ""}#${retryNonce}`;
  const quoteCurrent = quoteState?.key === quoteKey ? quoteState : null;
  const quote = quoteCurrent?.quote ?? null;
  const quoteError = quoteCurrent?.error ?? null;
  const quoteLoading = phase === "checkout" && cart.length > 0 && !quoteCurrent;

  // Price the cart with Square once the fan reaches checkout, and again only
  // if the cart or the promo changes while they are on that step.
  useEffect(() => {
    if (phase !== "checkout" || cart.length === 0) return;
    const key = quoteKey;
    let cancelled = false;
    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId: stand.locationId,
        promoCode: promoApplied,
        lines: cart.map((l) => ({ itemId: l.item.id, variationId: l.variation.id, quantity: l.quantity })),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setQuoteState({ key, quote: null, error: data.error ?? "We couldn't price this order." });
          return;
        }
        setQuoteState({ key, quote: data.quote as SquareOrderQuote, error: null });
      })
      .catch(() => {
        if (!cancelled) {
          setQuoteState({ key, quote: null, error: "We couldn't reach Square to price this order." });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, quoteKey, stand.locationId]);

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
    // Synchronously inside the tap, so iOS will let the "ready" chime play later.
    primeChime();
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
        // issuer demands it. This is Square's own calculated total (from
        // /api/quote); Square re-charges the order's real total server-side.
        let result: SquareTokenResult;
        try {
          result = await card.tokenize({
            amount: ((quote?.totalCents ?? 0) / 100).toFixed(2),
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
          recipientName: name.trim(),
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
      // The cart lives in the page now, so a completed order has to clear it
      // explicitly — unmounting the panel no longer throws it away.
      setCart([]);
      onCartStandChange(null);
      onOrderPlaced({
        orderId: data.orderId,
        locationId: stand.locationId,
        standName: stand.fanName ?? stand.displayName,
        role: stand.role,
        recipientName: name.trim(),
        seat: stand.role === "in_seat" ? seat : null,
        placedAt: Date.now(),
        paidWith: data.paidWith,
        amount: data.amount,
        receiptUrl: data.receiptUrl ?? null,
        cardBrand: data.cardBrand ?? null,
        cardLast4: data.cardLast4 ?? null,
        requiresIdCheck: Boolean(data.requiresIdCheck),
        stage: "received",
      });
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
    !quote ||
    !alcoholCheck.ok ||
    name.trim().length < 2 ||
    !phone ||
    seatIncomplete ||
    paymentsBroken ||
    (needsCard && (!cardReady || Boolean(cardError)));

  if (detailItem) {
    return (
      <ItemDetailSheet
        item={detailItem}
        taxesById={taxesById}
        canOrder={canOrder}
        onAdd={(variationId, qty) => addToCart(detailItem, variationId, qty)}
        onClose={() => setDetailItem(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="stand-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="stand-sheet-head">
          <button
            type="button"
            onClick={onClose}
            className="stand-sheet-back an-tap"
            aria-label="Back to stands"
          >
            ‹
          </button>
          <div className="stand-sheet-titles">
            <h2 className="an-display">{stand.fanName ?? stand.displayName}</h2>
            <p>{stand.role === "in_seat" ? "Delivered to your seat" : "Pick up at the stand"}</p>
          </div>
          {phase === "menu" && (
            <button
              type="button"
              onClick={() => setPhase("checkout")}
              disabled={cartCount === 0}
              className={`stand-sheet-cart an-tap ${cartCount > 0 ? "has-items" : ""}`}
              aria-label={cartCount > 0 ? `View cart, ${cartCount} items, ${money(subtotal)}` : "Cart is empty"}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="18" cy="20" r="1.5" />
                <path d="M2.5 3h2.6l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.9a1.5 1.5 0 0 0 1.4-1.1L21.5 7H6" />
              </svg>
              {cartCount > 0 && (
                <span key={justAdded?.nonce ?? 0} className={`stand-sheet-cart-count ${justAdded ? "is-bumped" : ""}`}>
                  {cartCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Screen-reader confirmation for adds; the card flash is the visual one. */}
        <p className="sr-only" aria-live="polite">{addedAnnouncement}</p>

        {!stand.isOpen && (
          <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ backgroundColor: "var(--heat-bar-bg)", color: "var(--text-secondary)" }}>
            This stand has closed online ordering for now.
          </div>
        )}

        {phase === "menu" && (
          <>
            <div className="menu-busy-row">
              <BusynessMeter busyness={busyness} />
              {liveHeat !== null && (
                <p className="menu-busy-note">based on sales in the last 15 min</p>
              )}
            </div>

            {menuSource === "mock" && (
              <div className="text-[10px] mb-3 px-2 py-1 rounded inline-block" style={{ backgroundColor: "var(--heat-bar-bg)", color: "var(--text-tertiary)" }}>
                DEMO MENU — not live Square data (no SQUARE_ACCESS_TOKEN configured)
              </div>
            )}

            {/* Category chips — the same categories the grid groups by. */}
            {categoryNames.length > 1 && (
              <div className="menu-chips" role="group" aria-label="Filter by category">
                <button
                  type="button"
                  className={`menu-chip an-tap an-label ${menuCategory === null ? "is-active" : ""}`}
                  onClick={() => setMenuCategory(null)}
                  aria-pressed={menuCategory === null}
                >
                  All
                </button>
                {categoryNames.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`menu-chip an-tap an-label ${menuCategory === c ? "is-active" : ""}`}
                    onClick={() => setMenuCategory(c)}
                    aria-pressed={menuCategory === c}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {loading && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading menu…</p>}
            {!loading && items.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Nothing orderable here right now.</p>
            )}

            {Array.from(grouped.entries())
              .filter(([cat]) => menuCategory === null || cat === menuCategory)
              .map(([cat, catItems]) => (
              <div key={cat} className="mb-5">
                <p className="menu-cat an-label">{cat}</p>
                <div className="menu-grid">
                  {catItems.map((item) => {
                    const alcoholic = isAlcoholicItem(item, taxesById);
                    const first = item.variations.find((v) => !v.soldOut) ?? item.variations[0];
                    const price = first?.priceMoney?.amount ?? 0;
                    const soldOut = item.variations.every((v) => v.soldOut);
                    const hasOptions = item.variations.length > 1;
                    const pricesVary = new Set(item.variations.map((v) => v.priceMoney?.amount ?? 0)).size > 1;
                    const inCart = qtyByItem.get(item.id) ?? 0;
                    // A one-option item in the cart gets a −/+ stepper on the
                    // card. With several options "−" would be ambiguous, so
                    // those keep Add (which reopens the popup).
                    const singleLine = !hasOptions && inCart > 0 ? cart.find((l) => l.item.id === item.id) : undefined;
                    const flashing = justAdded?.itemId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`menu-tile ${inCart > 0 ? "is-in-cart" : ""} ${flashing ? "is-flashing" : ""}`}
                      >
                        {inCart > 0 && (
                          <span className="menu-tile-badge" aria-hidden="true">✓ {inCart}</span>
                        )}
                        {/* Tapping the tile opens the detail sheet; the + adds
                            one straight to the cart without the detour. */}
                        <button
                          type="button"
                          className="menu-tile-main"
                          onClick={() => setDetailItem(item)}
                          aria-label={`${item.name}, ${price ? money(price) : "price unavailable"}. View details`}
                        >
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="menu-tile-photo" src={item.imageUrl} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className="menu-tile-photo is-placeholder" aria-hidden="true">
                              <span className="an-display">{item.name.charAt(0)}</span>
                            </span>
                          )}
                          <span className="menu-tile-name">{item.name}</span>
                          {item.description && <span className="menu-tile-desc">{item.description}</span>}
                          <span className="menu-tile-foot">
                            <span className="menu-tile-price an-price">
                              {pricesVary && price ? "from " : ""}
                              {price ? money(price) : "—"}
                            </span>
                            {alcoholic && <span className="menu-tile-19 an-label">19+</span>}
                          </span>
                          {hasOptions && (
                            <span className="menu-tile-options">{item.variations.length} options</span>
                          )}
                        </button>
                        {singleLine ? (
                          <div className="menu-tile-stepper" role="group" aria-label={`${item.name} in cart`}>
                            <button
                              type="button"
                              className="an-tap"
                              onClick={() => changeQty(singleLine.variation.id, -1)}
                              aria-label={`Remove one ${item.name}`}
                            >
                              −
                            </button>
                            <span>{singleLine.quantity} in cart</span>
                            <button
                              type="button"
                              className="an-tap"
                              onClick={() => addToCart(item, singleLine.variation.id)}
                              disabled={!canOrder || singleLine.quantity >= 20}
                              aria-label={`Add another ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="menu-tile-add an-tap"
                            disabled={!canOrder || soldOut || !first}
                            onClick={() => onAddPress(item)}
                            aria-label={hasOptions ? `Add ${item.name} to cart, choose an option` : `Add ${item.name} to cart`}
                            aria-haspopup={hasOptions ? "dialog" : undefined}
                          >
                            {soldOut ? "Sold out" : inCart > 0 ? "+ Add another" : "+ Add"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {cartCount > 0 && (
              <button
                onClick={() => setPhase("checkout")}
                className="w-full mt-2 py-3 rounded-lg font-semibold"
                style={{ backgroundColor: "var(--accent-gold)", color: "var(--text-inverted)" }}
              >
                View cart ({cartCount}) · {money(subtotal)}
              </button>
            )}
            {cartCount > 0 && (
              <p className="text-[10px] text-center mt-1" style={{ color: "var(--text-tertiary)" }}>
                Tax calculated at checkout
              </p>
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
              {quoteLoading && (
                <div className="quote-skeleton pt-2" aria-busy="true" aria-live="polite">
                  <span className="quote-skeleton-label">Pricing your order with Square…</span>
                  <div className="quote-skeleton-row" />
                  <div className="quote-skeleton-row" />
                  <div className="quote-skeleton-row is-total" />
                </div>
              )}

              {!quoteLoading && quoteError && (
                <div className="rounded-lg px-4 py-3 mt-2 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                  <p className="mb-2">{quoteError} Your order hasn&apos;t been placed and nothing has been charged.</p>
                  <button
                    type="button"
                    onClick={() => setRetryNonce((n) => n + 1)}
                    className="px-3 py-1.5 rounded font-semibold text-xs"
                    style={{ backgroundColor: "var(--btn-bg)", color: "var(--btn-text)" }}
                  >
                    Try again
                  </button>
                </div>
              )}

              {!quoteLoading && !quoteError && quote && (
                <>
                  <div className="flex justify-between text-sm pt-2" style={{ color: "var(--text-secondary)" }}>
                    <span>Subtotal</span><span>{money(quote.subtotalCents)}</span>
                  </div>
                  {quote.discountCents > 0 && (
                    <div className="flex justify-between text-sm" style={{ color: "#16a34a" }}>
                      <span>Code {promoApplied}</span><span>−{money(quote.discountCents)}</span>
                    </div>
                  )}
                  {quote.taxLines.map((t) => (
                    <div key={`${t.name}-${t.percentage}`} className="flex justify-between text-sm" style={{ color: "var(--text-tertiary)" }}>
                      <span>{t.name} {t.percentage}%</span><span>{money(t.amountCents)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    <span>Total</span><span>{money(quote.totalCents)}</span>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                    {quote.source === "mock"
                      ? "Mock data — no Square connection, so nothing here is priced for real."
                      : "The final total is calculated by Square and shown on your receipt."}
                  </p>
                </>
              )}
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
                placeholder="First name"
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
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                Staff call your name at {stand.role === "in_seat" ? "delivery" : "pickup"}, and use your phone only if
                they can&apos;t find you. Name and phone are both required. After you pay, this page shows when your
                order is ready — no texts, no account.
              </p>
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
                <div className="card-shell">
                  <div id="sq-card-container" />
                  {!cardReady && !cardError && (
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Loading secure card form…</p>
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
                {submitting
                  ? "Placing order…"
                  : !quote
                    ? "Place order"
                    : needsCard
                      ? `Pay ${money(quote.totalCents)}`
                      : `Place order · ${money(quote.totalCents)}`}
              </button>
            </div>
            <p className="text-[10px] text-center" style={{ color: "var(--text-tertiary)" }}>
              Payments are processed by Square. Your order goes straight to the stand once it is paid.
            </p>
          </div>
        )}
      </div>

      {pickerItem && (
        <OptionPickerSheet
          item={pickerItem}
          taxesById={taxesById}
          onAdd={(variationId, qty) => addToCart(pickerItem, variationId, qty)}
          onClose={() => setPickerItem(null)}
        />
      )}
    </div>
  );
}
