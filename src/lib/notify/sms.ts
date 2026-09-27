// Outbound SMS. Square has no API for texting a customer, and its own
// "order ready" texts only fire for Square Online / POS orders — not for
// orders created through the Orders API like ours (see STATUS.md, Sep 27).
// So we send our own, through Twilio's REST API (plain fetch, no SDK).
//
// Config (all server-only):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TWILIO_MESSAGING_SERVICE_SID  (preferred — pooled sender, handles STOP)
//   or TWILIO_FROM_NUMBER         (a single +1 number)
//
// Unset in dev = messages are logged to the console instead of sent. Unset
// in production = nothing is sent and a warning is logged; ordering itself
// never fails because a text couldn't go out.

import { isProductionRuntime } from "@/lib/redis";

export type SmsResult =
  | { sent: true; id: string }
  | { sent: false; reason: "not_configured" | "invalid_number" }
  /** `retryable` = worth letting Square redeliver the webhook (5xx / network). */
  | { sent: false; reason: "provider_error"; retryable: boolean; detail: string };

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string | null;
  fromNumber: string | null;
}

function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || null;
  const fromNumber = process.env.TWILIO_FROM_NUMBER || null;
  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) return null;
  return { accountSid, authToken, messagingServiceSid, fromNumber };
}

export function isSmsConfigured(): boolean {
  return twilioConfig() !== null;
}

/**
 * Normalize what the fan typed into E.164. The checkout accepts North
 * American numbers with or without the leading 1, or any number typed with
 * a leading +. Returns null when it can't be sure.
 */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms(rawTo: string, body: string): Promise<SmsResult> {
  const to = toE164(rawTo);
  if (!to) return { sent: false, reason: "invalid_number" };

  const config = twilioConfig();
  if (!config) {
    if (isProductionRuntime()) {
      console.warn("[notify/sms] Twilio is not configured — text not sent.");
    } else {
      console.log(`[notify/sms] (dev, not sent) to ${to}: ${body}`);
    }
    return { sent: false, reason: "not_configured" };
  }

  const form = new URLSearchParams({ To: to, Body: body });
  if (config.messagingServiceSid) form.set("MessagingServiceSid", config.messagingServiceSid);
  else form.set("From", config.fromNumber!);

  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      cache: "no-store",
    });
  } catch (err) {
    return { sent: false, reason: "provider_error", retryable: true, detail: String(err) };
  }

  const data = (await res.json().catch(() => null)) as { sid?: string; code?: number; message?: string } | null;
  if (res.ok && data?.sid) return { sent: true, id: data.sid };

  // 4xx is permanent for this message (bad number, fan replied STOP = 21610,
  // unverified trial recipient…) — retrying won't help. 5xx/429 might.
  const retryable = res.status >= 500 || res.status === 429;
  return {
    sent: false,
    reason: "provider_error",
    retryable,
    detail: `${res.status} ${data?.code ?? ""} ${data?.message ?? ""}`.trim(),
  };
}
