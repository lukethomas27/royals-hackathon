// Persistence for the section 6a staff control surface: per-stand manual
// open/close override + a scheduled cutoff time (fallback safety net).
//
// IMPORTANT — dev-only persistence: this uses an in-process Map, backed by
// a JSON file on disk for convenience across `npm run dev` restarts. That
// is NOT durable on Vercel's serverless runtime (filesystem writes don't
// persist across invocations/instances in production, and in-memory state
// resets on cold start). Before launch this needs a real small
// datastore — Vercel KV / Upstash Redis is the natural fit for something
// this small. Flagged in STATUS.md. Swap the two functions below for reads
// against that store and everything else (the API route, the staff UI, the
// ordering-availability check) needs no changes.

import fs from "fs";
import path from "path";

export interface StandOrderingState {
  manualOverride: "open" | "closed" | null; // null = follow schedule
  scheduledCutoff: string | null; // ISO datetime, per-game close time fallback
}

const DEFAULT_STATE: StandOrderingState = { manualOverride: null, scheduledCutoff: null };

const DATA_FILE = path.join(process.cwd(), ".data", "stand-ordering-state.json");

function readAll(): Record<string, StandOrderingState> {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, StandOrderingState>) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Best-effort in dev; production should not depend on this path at all.
  }
}

export async function getStandOrderingState(locationId: string): Promise<StandOrderingState> {
  const all = readAll();
  return all[locationId] ?? DEFAULT_STATE;
}

export async function setStandOrderingState(
  locationId: string,
  state: Partial<StandOrderingState>
): Promise<StandOrderingState> {
  const all = readAll();
  const next = { ...(all[locationId] ?? DEFAULT_STATE), ...state };
  all[locationId] = next;
  writeAll(all);
  return next;
}

/**
 * Is this stand currently taking online orders? Manual override always
 * wins (section 6a: "the manual switch is the real control, the schedule
 * is the safety net, not the other way around"). Absent an override, falls
 * back to the scheduled cutoff.
 */
export function isOrderingOpen(state: StandOrderingState, now: Date = new Date()): boolean {
  if (state.manualOverride === "open") return true;
  if (state.manualOverride === "closed") return false;
  if (state.scheduledCutoff) {
    return now.getTime() < new Date(state.scheduledCutoff).getTime();
  }
  return true; // no schedule set yet — default open
}
