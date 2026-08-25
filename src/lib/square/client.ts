// Thin fetch wrapper around the Square REST API.
//
// This app has no live Square credentials in this build session (see
// STATUS.md). It is written against the real API shape so that dropping in
// SQUARE_ACCESS_TOKEN is the only step needed to go live — but the exact
// response shapes for a couple of fields (ecom visibility, self-serve,
// Ordering Stations) are unverified against Eventium's actual account and
// are flagged where they're used.

const SQUARE_VERSION = "2025-01-23";

export type SquareEnvironment = "sandbox" | "production";

function baseUrl(env: SquareEnvironment): string {
  return env === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export interface SquareClientConfig {
  accessToken: string;
  environment: SquareEnvironment;
}

export class SquareApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "SquareApiError";
    this.status = status;
    this.body = body;
  }
}

export function getSquareConfig(): SquareClientConfig | null {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const environment = (process.env.SQUARE_ENVIRONMENT as SquareEnvironment) || "sandbox";
  if (!accessToken) return null;
  return { accessToken, environment };
}

/** True when we have no real credentials and must fall back to mock data. */
export function isSquareConfigured(): boolean {
  return getSquareConfig() !== null;
}

export async function squareRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const config = getSquareConfig();
  if (!config) {
    throw new Error(
      "Square is not configured (SQUARE_ACCESS_TOKEN missing). " +
        "Callers should check isSquareConfigured() and use the mock adapter " +
        "in dev instead of calling squareRequest directly."
    );
  }

  const res = await fetch(`${baseUrl(config.environment)}${path}`, {
    ...init,
    headers: {
      "Square-Version": SQUARE_VERSION,
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    // Menu/location reads change through the season (section 4) — never
    // let Next.js cache these across requests.
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new SquareApiError(
      `Square API ${path} failed with ${res.status}`,
      res.status,
      body
    );
  }

  return body as T;
}
