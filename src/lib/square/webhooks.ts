// Square webhook signature check. Square signs each delivery with
// HMAC-SHA256 over (notification URL + raw request body), keyed with the
// subscription's signature key, base64-encoded, in the
// `x-square-hmacsha256-signature` header. The URL must be byte-for-byte the
// one registered on the subscription, which is why it's configured
// explicitly (SQUARE_WEBHOOK_URL) rather than trusted from request headers.

import { createHmac, timingSafeEqual } from "crypto";

export const SQUARE_SIGNATURE_HEADER = "x-square-hmacsha256-signature";

export function getWebhookConfig(): { signatureKey: string; notificationUrl: string | null } | null {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!signatureKey) return null;
  return { signatureKey, notificationUrl: process.env.SQUARE_WEBHOOK_URL || null };
}

export function isValidSquareSignature(opts: {
  rawBody: string;
  signature: string | null;
  signatureKey: string;
  notificationUrl: string;
}): boolean {
  if (!opts.signature) return false;
  const expected = createHmac("sha256", opts.signatureKey)
    .update(opts.notificationUrl + opts.rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Envelope fields we read from `order.updated` / `order.fulfillment.updated`. */
export interface SquareOrderWebhookEvent {
  type?: string;
  event_id?: string;
  data?: {
    id?: string;
    object?: {
      order_updated?: { order_id?: string; location_id?: string };
      order_fulfillment_updated?: { order_id?: string; location_id?: string };
    };
  };
}
