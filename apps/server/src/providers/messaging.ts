/**
 * Messaging provider abstraction (Task 9).
 *
 * Each channel has a thin adapter that only performs a real network call when
 * its credentials are available. Credentials resolve in this order (Task 17
 * Integrations Center):
 *   1. settings-backed integration record (`integration:<channel>`, enabled)
 *      → adapter built with the DECRYPTED settings credentials;
 *   2. environment variables (WHATSAPP / SMS / EMAIL webhooks) → env adapter;
 *   3. otherwise `getProvider` throws `NotConfiguredError` with the exact
 *      variable to set.
 * Secrets live in process env OR in the encrypted settings record — never in
 * any API response.
 *
 * Cycle note: `services/integrations.ts` imports the env helpers below while
 * this module imports `getResolvedCredentials` from it. Both cross-references
 * are only used inside function bodies (never at module-evaluation time).
 */

import { whatsappProvider, createWhatsAppProvider } from "./whatsapp.js";
import { smsProvider, createSmsProvider } from "./sms.js";
import { emailProvider, createEmailProvider } from "./email.js";
import { getResolvedCredentials } from "../services/integrations.js";

export type MessageChannel = "whatsapp" | "sms" | "email";

export interface ProviderSendInput {
  channel: MessageChannel;
  recipient: string;
  body: string;
  variables?: Record<string, unknown>;
}

export interface MessageProvider {
  send(msg: ProviderSendInput): Promise<{ providerId?: string }>;
}

export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfiguredError";
  }
}

/** Required env vars per channel — surfaced by GET /api/messages/providers as booleans only. */
const REQUIRED_ENV: Record<MessageChannel, string[]> = {
  whatsapp: ["WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
  sms: ["SMS_WEBHOOK_URL"],
  email: ["EMAIL_WEBHOOK_URL"],
};

/** Names of the env vars a channel falls back to (Task 17 health hints). */
export function requiredEnvFor(channel: MessageChannel): string[] {
  return [...(REQUIRED_ENV[channel] ?? [])];
}

/** True when every required env var for the channel is present (values are never exposed). */
export function isProviderConfigured(channel: MessageChannel): boolean {
  const vars = REQUIRED_ENV[channel];
  if (!vars) return false;
  return vars.every((v) => !!process.env[v]?.trim());
}

function notConfigured(channel: MessageChannel): NotConfiguredError {
  const vars = REQUIRED_ENV[channel] ?? [];
  const hint = vars.join(", ");
  const label = channel.charAt(0).toUpperCase() + channel.slice(1);
  return new NotConfiguredError(`${label} provider not configured — set ${hint}`);
}

/**
 * Registry fields a settings-backed channel needs before its adapter can be
 * built. Kept in sync with PROVIDERS in services/integrations.ts (the raw
 * key names are not secret — only the values are).
 */
const SETTINGS_REQUIRED: Record<MessageChannel, string[]> = {
  whatsapp: ["apiToken", "phoneNumberId"],
  sms: ["webhookUrl"],
  email: ["webhookUrl"],
};

/**
 * Build a settings-credentials adapter for the channel, or null when the
 * resolved record is incomplete. Values come from getResolvedCredentials
 * (already decrypted); env is only a fallback inside the adapter factory for
 * optional extras (SMS_API_KEY / SMS_SENDER).
 */
function settingsProvider(
  channel: MessageChannel,
  resolved: NonNullable<ReturnType<typeof getResolvedCredentials>>
): MessageProvider | null {
  const values = { ...resolved.config, ...resolved.secrets };
  const required = SETTINGS_REQUIRED[channel];
  if (!required.every((key) => !!String(values[key] ?? "").trim())) return null;
  switch (channel) {
    case "whatsapp":
      return createWhatsAppProvider({
        apiToken: values.apiToken,
        phoneNumberId: values.phoneNumberId,
      });
    case "sms":
      return createSmsProvider({ webhookUrl: values.webhookUrl, sender: values.sender });
    case "email":
      return createEmailProvider({ webhookUrl: values.webhookUrl });
    default:
      return null;
  }
}

/**
 * Resolve the adapter for a channel. Settings credentials (Integrations
 * Center) win over env; when neither is available it throws
 * `NotConfiguredError` before any network round-trip. Env is read on every
 * call (never at module load) so tests can assert the unconfigured path
 * safely — with no settings rows the behaviour is identical to Task 9.
 */
export function getProvider(channel: MessageChannel): MessageProvider {
  try {
    const resolved = getResolvedCredentials(channel);
    if (resolved) {
      const fromSettings = settingsProvider(channel, resolved);
      if (fromSettings) return fromSettings;
    }
  } catch {
    // Decrypt/lookup failure → fall through to the env path (or NotConfigured).
  }
  if (!isProviderConfigured(channel)) throw notConfigured(channel);
  switch (channel) {
    case "whatsapp":
      return whatsappProvider;
    case "sms":
      return smsProvider;
    case "email":
      return emailProvider;
    default:
      throw notConfigured(channel);
  }
}
