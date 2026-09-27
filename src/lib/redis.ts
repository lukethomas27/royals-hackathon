// Shared Upstash Redis client (REST, `@upstash/redis`). Used by the staff
// open/close state (staffState.ts) and the SMS de-duplication store
// (notify/orderUpdates.ts).
//
// Both env naming conventions are accepted: the Vercel Marketplace
// integration's legacy `KV_REST_API_URL` / `KV_REST_API_TOKEN` and Upstash's
// own `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

import { Redis } from "@upstash/redis";

function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

let redisClient: Redis | null = null;

/** The shared client, or null when no store is configured (local dev). */
export function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const creds = redisCredentials();
  if (!creds) return null;
  redisClient = new Redis({ url: creds.url, token: creds.token });
  return redisClient;
}

/** True when this deployment must not rely on per-process / on-disk fallbacks. */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}
