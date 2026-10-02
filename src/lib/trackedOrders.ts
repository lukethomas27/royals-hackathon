"use client";

// The fan's placed orders, kept in this browser so the live tracker survives a
// reload, a locked phone or closing the panel (arena tabs reload constantly).
// This is a per-viewer convenience only: Square holds the real order, and
// losing storage (private window, cleared data) just loses the tracker.
//
// Exposed as an external store for useSyncExternalStore: the server snapshot
// is always empty, the client reads localStorage once and caches it.

import { useEffect, useSyncExternalStore } from "react";
import { MAX_STATUS_IDS, OrderStage, OrderStatus, TERMINAL_STAGES } from "./orderStage";

export interface TrackedOrder {
  orderId: string;
  locationId: string;
  standName: string;
  role: "pickup" | "in_seat";
  recipientName: string;
  seat: { section: string; row: string; seat: string } | null;
  placedAt: number;
  paidWith: "card" | "promo" | "mock";
  amount: { amount: number; currency: string };
  receiptUrl: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  requiresIdCheck: boolean;
  stage: OrderStage;
}

const STORAGE_KEY = "arenapulse:orders:v1";
/** A game is over well inside this; older orders are dropped on load. */
const EXPIRE_MS = 6 * 60 * 60 * 1000;
/** Square does not change faster than staff can tap. */
export const POLL_MS = 10_000;

const EMPTY: TrackedOrder[] = [];
let cache: TrackedOrder[] | null = null;
const listeners = new Set<() => void>();

function load(): TrackedOrder[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TrackedOrder[]) : [];
    const cutoff = Date.now() - EXPIRE_MS;
    return Array.isArray(parsed) ? parsed.filter((o) => o?.orderId && o.placedAt > cutoff) : [];
  } catch {
    return [];
  }
}

function getSnapshot(): TrackedOrder[] {
  if (cache === null) cache = load();
  return cache;
}

function getServerSnapshot(): TrackedOrder[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function write(next: TrackedOrder[]) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full: the tracker still works until the tab reloads.
  }
  listeners.forEach((l) => l());
}

/** Newest first. Capped so one status poll can always cover every order. */
export function addTrackedOrder(order: TrackedOrder) {
  const rest = getSnapshot().filter((o) => o.orderId !== order.orderId);
  write([order, ...rest].slice(0, MAX_STATUS_IDS));
}

export function dismissTrackedOrder(orderId: string) {
  write(getSnapshot().filter((o) => o.orderId !== orderId));
}

/** Applies polled stages. Returns the orders that have just become ready. */
function applyStatuses(statuses: OrderStatus[]): TrackedOrder[] {
  const byId = new Map(statuses.map((s) => [s.orderId, s.stage]));
  const nowReady: TrackedOrder[] = [];
  let changed = false;
  const next = getSnapshot().map((o) => {
    const stage = byId.get(o.orderId);
    if (!stage || stage === o.stage) return o;
    changed = true;
    if (stage === "ready") nowReady.push(o);
    return { ...o, stage };
  });
  if (changed) write(next);
  return nowReady;
}

// --- "Ready" alert: vibrate + chime. No permissions, no subscription. ---

let audioCtx: AudioContext | null = null;

/**
 * Call from a tap (the Pay button). iOS only lets a page make sound after a
 * user gesture has started its AudioContext; priming it then lets the chime
 * play minutes later. A restored order after a reload may stay silent until
 * the fan taps something — the screen and vibration still change.
 */
export function primeChime() {
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
  } catch {
    // No Web Audio: the visual state change is the alert.
  }
}

function chime() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    void ctx.resume();
    [880, 1320].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch {
    // Ignore: sound is a bonus.
  }
}

function alertReady() {
  // Android only; iOS Safari has no Vibration API.
  navigator.vibrate?.([200, 100, 200, 100, 400]);
  chime();
}

/**
 * The fan's tracked orders, polled against Square while any is still open.
 * Polls only while the tab is visible and catches up the moment it is shown
 * again, so a locked phone costs no requests. Mount once, at the page.
 */
export function useTrackedOrders(): TrackedOrder[] {
  const orders = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const activeIds = orders
    .filter((o) => !TERMINAL_STAGES.has(o.stage))
    .map((o) => o.orderId)
    .join(",");

  useEffect(() => {
    if (!activeIds) return;
    let stopped = false;
    let inFlight = false;

    async function tick() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await fetch(`/api/orders/status?ids=${encodeURIComponent(activeIds)}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as { orders?: OrderStatus[] };
        if (stopped) return;
        if (applyStatuses(data.orders ?? []).length > 0) alertReady();
      } catch {
        // Arena wifi: keep the last known stage and try again next tick.
      } finally {
        inFlight = false;
      }
    }

    void tick();
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeIds]);

  return orders;
}
