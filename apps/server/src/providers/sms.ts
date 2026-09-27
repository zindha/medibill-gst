/**
 * SMS adapter — generic HTTP webhook. POST { to, text, sender } to the
 * webhook URL so any SMS gateway (MSG91, Twilio, an in-house relay) can be
 * plugged in without a vendor SDK. URL/sender resolve per call: explicit
 * creds (Integrations Center settings) win over SMS_WEBHOOK_URL / SMS_SENDER
 * env. Optional SMS_API_KEY / SMS_SENDER env are sent as headers when present.
 */

import type { MessageProvider } from "./messaging.js";
import { NotConfiguredError } from "./messaging.js";

export interface SmsCreds {
  webhookUrl?: string;
  sender?: string;
}

/** Build an adapter. Without creds it reads env at send-time (Task 9 behaviour). */
export function createSmsProvider(creds: SmsCreds = {}): MessageProvider {
  return {
    async send(msg) {
      const url = creds.webhookUrl?.trim() || process.env.SMS_WEBHOOK_URL?.trim();
      if (!url) {
        throw new NotConfiguredError("SMS provider not configured — set SMS_WEBHOOK_URL");
      }
      const sender = creds.sender?.trim() || process.env.SMS_SENDER?.trim();

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.SMS_API_KEY?.trim()) headers["X-Api-Key"] = process.env.SMS_API_KEY.trim();
      if (sender) headers["X-Sender"] = sender;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: msg.recipient,
          text: msg.body,
          sender: sender || undefined,
          variables: msg.variables,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`SMS webhook error ${res.status}: ${detail.slice(0, 300)}`);
      }

      const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
      return { providerId: data?.messageId ?? data?.id };
    },
  };
}

/** Env-driven default instance (kept for direct imports). */
export const smsProvider: MessageProvider = createSmsProvider();
