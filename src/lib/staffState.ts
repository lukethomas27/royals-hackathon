// Persistence for the section 6a staff control surface: per-stand manual
// open/close override + a scheduled cutoff time (fallback safety net).
//
// Backed by Vercel KV (Upstash Redis under the hood) when KV_REST_API_URL /
// KV_REST_API_TOKEN are set — that's the durable path, safe on Vercel's
// serverless runtime. When they're unset (local dev without a provisioned
// KV store, or this mock-data build), falls back to a JSON file on disk so
// `npm run dev` keeps working without any external service. That file
// fallback is explicitly dev-only — same non-durability caveat as before,
// just no longer the only option. No code outside this file needs to
// change either way; both paths implement the same two functions.

import { kv } from "@vercel/kv";
import fs from "fs";
import path from "path";

export interface StandOrderingState {
  manualOverride: "open" | "closed" | null; // null = follow schedule
  scheduledCutoff: string | null; // ISO datetime, per-game close time fallback
}

const DEFAULT_STATE: StandOrderingState = { manualOverride: null, scheduledCutoff: null };

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

const KV_KEY_PREFIX = "arenapulse:stand-ordering:";

// --- dev-only fallback, used only when no KV store is configured ---

const DATA_FILE = path.join(process.cwd(), ".data", "stand-ordering-state.json");

function readAllFromFile(): Record<string, StandOrderingState> {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAllToFile(data: Record<string, StandOrderingState>) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Best-effort in dev; production should not depend on this path at all.
  }
}

export async function getStandOrderingState(locationId: string): Promise<StandOrderingState> {
  if (isKvConfigured()) {
    const state = await kv.get<StandOrderingState>(KV_KEY_PREFIX + locationId);
    return state ?? DEFAULT_STATE;
  }
  const all = readAllFromFile();
  return all[locationId] ?? DEFAULT_STATE;
}

export async function setStandOrderingState(
  locationId: string,
  state: Partial<StandOrderingState>
): Promise<StandOrderingState> {
  if (isKvConfigured()) {
    const current = await kv.get<StandOrderingState>(KV_KEY_PREFIX + locationId);
    const next = { ...(current ?? DEFAULT_STATE), ...state };
    await kv.set(KV_KEY_PREFIX + locationId, next);
    return next;
  }
  const all = readAllFromFile();
  const next = { ...(all[locationId] ?? DEFAULT_STATE), ...state };
  all[locationId] = next;
  writeAllToFile(all);
  return next;
}

/**
 * Is this stand currently taking online orders? Manual override always
 * wins (section 6a: "the manual switch is the real control, the schedule
 * is the safety net, not the other way around"). Absent an override, falls
 * back to the scheduled cutoff.
 *
 * FAIL CLOSED (changed 2026-09-07): with no override and no cutoff set, a
 * stand is CLOSED. This app is reachable from a public URL around the
 * clock, but fans may only order while a game is on and staff are at the
 * stand — so ordering is something staff switch ON per game at /staff,
 * never something that is on by default. A cutoff on its own (no
 * override) opens the stand until that time, which is the "pre-set
 * tonight's close, then flip Open at doors" flow.
 */
export function isOrderingOpen(state: StandOrderingState, now: Date = new Date()): boolean {
  if (state.manualOverride === "open") return true;
  if (state.manualOverride === "closed") return false;
  if (state.scheduledCutoff) {
    return now.getTime() < new Date(state.scheduledCutoff).getTime();
  }
  return false; // nothing set = closed, never open by accident
}
