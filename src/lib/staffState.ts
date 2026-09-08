// Persistence for the section 6a staff control surface: per-stand manual
// open/close override + a scheduled cutoff time (fallback safety net).
//
// Backed by Upstash Redis (REST client, `@upstash/redis`) when its URL and
// token env vars are set — that's the durable path, safe on Vercel's
// serverless runtime where instances share no disk and are recycled at
// will. Provision it from the Vercel Marketplace (Storage → Upstash Redis)
// and link it to this project; Vercel then injects the env vars below.
// Both naming conventions are accepted: the Marketplace integration's
// legacy `KV_REST_API_URL` / `KV_REST_API_TOKEN` and Upstash's own
// `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
//
// (Replaced `@vercel/kv` on 2026-09-08 — that package is deprecated; Vercel
// KV moved to Upstash Redis under Integrations. Same key layout, so any
// existing store carries over.)
//
// When neither is set (local `npm run dev`), falls back to a JSON file on
// disk so the app runs without any external service. That fallback is
// explicitly dev-only: on Vercel it would silently forget staff state, so
// this module refuses it in production and fails loudly instead.

import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

export interface StandOrderingState {
  manualOverride: "open" | "closed" | null; // null = follow schedule
  scheduledCutoff: string | null; // ISO datetime, per-game close time fallback
}

const DEFAULT_STATE: StandOrderingState = { manualOverride: null, scheduledCutoff: null };

const KV_KEY_PREFIX = "arenapulse:stand-ordering:";

function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

let redisClient: Redis | null = null;
function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const creds = redisCredentials();
  if (!creds) return null;
  redisClient = new Redis({ url: creds.url, token: creds.token });
  return redisClient;
}

/** True when this deployment must not rely on the on-disk fallback. */
function fileFallbackForbidden(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

// --- dev-only fallback, used only when no Redis store is configured ---

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
    // Best-effort in dev; production never reaches this path (see below).
  }
}

function assertFallbackAllowed() {
  if (fileFallbackForbidden()) {
    throw new Error(
      "Staff ordering state has no durable store: set UPSTASH_REDIS_REST_URL/TOKEN " +
        "(or KV_REST_API_URL/TOKEN) — link an Upstash Redis store to this Vercel project. " +
        "Refusing the on-disk fallback in production because it silently loses state."
    );
  }
}

export async function getStandOrderingState(locationId: string): Promise<StandOrderingState> {
  const redis = getRedis();
  if (redis) {
    const state = await redis.get<StandOrderingState>(KV_KEY_PREFIX + locationId);
    return state ?? DEFAULT_STATE;
  }
  assertFallbackAllowed();
  const all = readAllFromFile();
  return all[locationId] ?? DEFAULT_STATE;
}

export async function setStandOrderingState(
  locationId: string,
  state: Partial<StandOrderingState>
): Promise<StandOrderingState> {
  const redis = getRedis();
  if (redis) {
    const current = await redis.get<StandOrderingState>(KV_KEY_PREFIX + locationId);
    const next = { ...(current ?? DEFAULT_STATE), ...state };
    await redis.set(KV_KEY_PREFIX + locationId, next);
    return next;
  }
  assertFallbackAllowed();
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
