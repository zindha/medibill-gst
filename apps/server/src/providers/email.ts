/**
 * Email adapter — generic HTTP webhook POST { to, subject, body }. The URL
 * resolves per call: explicit creds (Integrations Center settings) win over
 * EMAIL_WEBHOOK_URL env. nodemailer is intentionally not a dependency, so
 * email is NotConfigured unless a webhook (e.g. a local relay) is provided.
 */

import type { MessageProvider } from "./messaging.js";
import { NotConfiguredError } from "./messaging.js";

export interface EmailCreds {
  webhookUrl?: string;
}

/** Build an adapter. Without creds it reads env at send-time (Task 9 behaviour). */
export function createEmailProvider(creds: EmailCreds = {}): MessageProvider {
  return {
    async send(msg) {
      const url = creds.webhookUrl?.trim() || process.env.EMAIL_WEBHOOK_URL?.trim();
      if (!url) {
        throw new NotConfiguredError("Email provider not configured — set EMAIL_WEBHOOK_URL");
      }

      const subject =
        (typeof msg.variables?.subject === "string" && msg.variables.subject) ||
        "Message from your pharmacy";

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: msg.recipient, subject, body: msg.body }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Email webhook error ${res.status}: ${detail.slice(0, 300)}`);
      }

      const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
      return { providerId: data?.messageId ?? data?.id };
    },
  };
}

/** Env-driven default instance (kept for direct imports). */
export const emailProvider: MessageProvider = createEmailProvider();
