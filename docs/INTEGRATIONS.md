# MediBill — Integrations Reference

Consolidated reference for every external service touch-point: the provider
registry, its environment variables, the encrypted-secret store, health
resolution, connect/disconnect semantics and how reports are delivered.
Endpoint shapes stay in [API.md](./API.md#integrations-center); this file is
the "how it works and what it is wired to" companion.

Code: `apps/server/src/services/integrations.ts` (registry, crypto, health),
`apps/server/src/routes/integrations.ts` (HTTP), UI at
`/dashboard/integrations` (`src/pages/IntegrationsPage.tsx`).

---

## Provider registry

One entry per external service (`PROVIDERS`), returned by
`GET /api/integrations`:

| id | Name | Category | Config fields (secret in parentheses) | Notes |
|----|------|----------|---------------------------------------|-------|
| `whatsapp` | WhatsApp (Cloud API) | Messaging | `apiToken` (secret), `phoneNumberId` | Cloud API send path |
| `sms` | SMS Gateway | Messaging | `webhookUrl` (secret), `sender` | Generic POST `{ to, text, sender }` |
| `email` | Email | Messaging | `webhookUrl` (secret) | Generic POST `{ to, subject, body }` |
| `einvoice` | E-Invoice (fake IRN generator) | Compliance | none | Informational card only — see [E-invoice](#e-invoice--e-way-fake-only) |
| `google_drive` | Google Drive Backup | Backup | none | OAuth flow lives in Settings → Backup |
| `online_orders` | Online Ordering | Storefront | none | Toggle mirrored to the `online_orders` setting |
| `payment_collect` | Payment Collection (UPI QR) | Payments | `upiId` | Informational — MediBill renders a UPI QR, there is no gateway |

---

## Environment variables

**Messaging is the only channel that still reads process env** (server
`.env`, never stored in settings, never returned by the API):

| Channel | Required env | Optional env |
|---------|--------------|--------------|
| `whatsapp` | `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | — |
| `sms` | `SMS_WEBHOOK_URL` | `SMS_API_KEY`, `SMS_SENDER` |
| `email` | `EMAIL_WEBHOOK_URL` | — |

An unconfigured channel fails fast with `"<Channel> provider not configured —
set <ENV>"` — a permanent failure, no network call attempted.

**Removed by decision:** the live NIC e-invoice adapter and its env surface
(`EINVOICE_PROVIDER`, `EINVOICE_GSP_ID`, `EINVOICE_GSP_KEY`,
`EINVOICE_USERNAME`, `EINVOICE_PASSWORD`, `EINVOICE_BASE_URL`, `EWAY_BASE_URL`)
no longer exist anywhere in the code. E-invoice and e-way bill generation run
on the local fake provider — see below.

---

## Encrypted-secret storage

Each provider owns exactly one `settings` row keyed `integration:<id>`:

```json
{
  "enabled": true,
  "config":  { "phoneNumberId": "9876543210" },
  "secrets": { "apiToken": "enc:v1:<base64(iv|tag|cipher)>" },
  "connectedAt": "2026-09-27T09:00:00.000Z",
  "updatedBy": "<userId>"
}
```

- **Algorithm:** AES-256-GCM, laid out as `[IV 16][AuthTag 16][Ciphertext]`,
  base64 — byte-for-byte the same construction as backup archives
  (`apps/server/src/backup/crypto.ts`).
- **Key:** a dedicated 32-byte hex file `DATA_DIR/integration.key`,
  auto-generated once (race-safe `wx` write). Never logged, never exported,
  never returned by any endpoint.
- **`enc:v1:` prefix** makes ciphertext obvious in raw rows and in redacted
  API output; a stored secret must decrypt successfully for the provider to
  count as configured (a replaced/corrupt key ⇒ "not configured", never a
  crash).
- **Scope:** `settings` is a per-install singleton (no tenant column) — one
  integration configuration is shared by every user of the install.

---

## Connect / disconnect semantics

- `POST /api/integrations/:id/connect { config?, secrets?, enabled? }` —
  **admin | pharmacist** (cashier → 403), unknown id → 404.
  - A value may arrive in either bucket; it is routed to the correct one
    (secret ⇒ encrypted, plain ⇒ stored as-is).
  - When `enabled` resolves to true, **every** registry field must have a
    value (from this payload or an already-stored one) → else
    `400 Missing required fields for <id>: …`.
  - Audit `integration.connected` records field **NAMES** only — never a
    value, never a decrypted secret.
  - `online_orders` additionally mirrors the toggle into the shared
    `online_orders` settings singleton so health stays coherent.
- `POST /api/integrations/:id/disconnect` — **admin | pharmacist**.
  Disconnect **forgets**: config + secrets are wiped and the settings row is
  deleted outright. It is documented as *not* a soft disable. For
  `online_orders` it also flips the shared toggle off. Audit
  `integration.disconnected`.
- Reads (`GET /api/integrations`, `GET /api/integrations/:id`) need only
  `authGuard`. Secrets are redacted to `"•••"` on the way out; decrypted
  secrets are never returned.

---

## Health precedence

`GET /api/integrations/:id` → `{ enabled, connected, mode, missingEnv,
connectedAt, detail? }` where `mode` is one of `settings | env | fake | null`:

1. **Messaging channels** (`whatsapp`, `sms`, `email`):
   enabled settings record with complete, decryptable credentials →
   `mode: "settings"`, `connected: true`; else env present → `mode: "env"`,
   `connected: true`; else `mode: null`, `connected: false`, and `missingEnv`
   lists the missing env var **NAMES** (values are never read into a
   response).
2. **`einvoice`** → always `mode: "fake"`, `connected: true`, `enabled: true`,
   `missingEnv: []`. There is no settings path and no env path: this build
   is fake-only.
3. **`google_drive`** → live status from `backup/drive.getDriveStatus()`
   (`detail.email`, `detail.folder`); `connected` follows the OAuth flow.
4. **`online_orders`** → the shared settings toggle.
5. **`payment_collect`** → configured when an enabled record stores a `upiId`.

`connected` folds in the user toggle for settings-backed providers; env and
fake paths report connected on their own.

---

## E-invoice / e-way (fake only)

`providers/gst.ts` exposes a single adapter, `fakeGstProvider`, and
`getGstProvider()` returns it on every call (a `__setGstProviderForTest` hook
exists for tests only):

- IRNs are `FAKE…` prefixed and **not government-issued**; ack numbers are
  `ACK…`, QR payloads are locally generated base64, cancels are unconditional
  and e-way bills are `EWB…` valid for 24h.
- Because the adapter cannot fail "for lack of configuration", the compliance
  service has **no 503 path** — provider failures surface as `422`
  rejections only.
- `GET /api/compliance/providers` returns the static contract
  `{ provider: "fake", einvoice: true, eway: true, live: false, note }`.
- The Integrations card is informational: **no credential fields**, connect
  is a no-op enabled toggle.

---

## Scheduled-report delivery

Reports (`apps/server/src/services/reportsDelivery.ts`) are generated on the
server, stored through `fileStorage` (purpose `scheduled-report`) and
delivered as one `custom` message per recipient through the messaging outbox:

| Format | File | Delivery body |
|--------|------|---------------|
| `csv` | `text/csv`, UTF-8 + BOM, RFC 4180 | Summary counts + the CSV **inlined when ≤ 100 KB** (else a "(CSV saved …)" note) |
| `pdf` | `application/pdf`, server-rendered A4 (`buildPdf`) | Summary counts + **"PDF available in Scheduled Reports"** — never the binary |

Channel messages cannot carry attachments, so a PDF is always **downloaded
from the run** (`GET /api/files/:id` from the run history in Scheduled
Reports). Queueing is provider-agnostic: a delivery row + pending outbox
event are created even with no messaging provider configured, and a messaging
failure never fails the run (`message_status` records the best effort).

---

## Online ordering toggle

`online_orders` is a storefront switch, not an external service: connecting it
mirrors `enabled` into the shared `online_orders` settings singleton, which
gates the public order portal (`/order?storeId=…`) and the public API
(`POST /api/public/orders`). The Integrations card renders the toggle inline
plus a shortcut to the order queue.

---

## Google Drive backup

The Drive card is a pointer: the real flow (OAuth consent, folder selection)
lives in **Settings → Backup** (`routes/backup.ts` + `backup/drive.ts`). Its
health mirrors `getDriveStatus()` and shows the connected account email (never
a token).

---

## Payment collection (informational)

MediBill renders your UPI ID as a QR code — there is no payment gateway, no
settlement account and no webhook. Saving a `upiId` only makes the QR
available for display.

---

## API pointer

Endpoint request/response shapes, role gates and error codes are documented in
[API.md → Integrations Center](./API.md#integrations-center) and
[API.md → Scheduled Reports](./API.md#scheduled-reports); this file does not
duplicate them.
