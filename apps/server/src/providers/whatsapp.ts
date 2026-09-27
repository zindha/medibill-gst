/**
 * WhatsApp Cloud API adapter — thin fetch wrapper over
 * POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages.
 * Credentials resolve per call: explicit creds (Integrations Center settings)
 * win over WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID env.
 */

import type { MessageProvider } from "./messaging.js";
import { NotConfiguredError } from "./messaging.js";

export interface WhatsAppCreds {
  apiToken?: string;
  phoneNumberId?: string;
}

/** Build an adapter. Without creds it reads env at send-time (Task 9 behaviour). */
export function createWhatsAppProvider(creds: WhatsAppCreds = {}): MessageProvider {
  return {
    async send(msg) {
      const token = creds.apiToken?.trim() || process.env.WHATSAPP_API_TOKEN?.trim();
      const phoneId = creds.phoneNumberId?.trim() || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
      if (!token || !phoneId) {
        throw new NotConfiguredError("WhatsApp provider not configured — set WHATSAPP_API_TOKEN");
      }

      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: msg.recipient,
          type: "text",
          text: { preview_url: false, body: msg.body },
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // Non-2xx is treated as transient by the worker (rate limits recover).
        throw new Error(`WhatsApp API error ${res.status}: ${detail.slice(0, 300)}`);
      }

      const data = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
      };
      return { providerId: data?.messages?.[0]?.id };
    },
  };
}

/** Env-driven default instance (kept for direct imports). */
export const whatsappProvider: MessageProvider = createWhatsAppProvider();
