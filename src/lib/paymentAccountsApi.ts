/**
 * Payment accounts API (G4a-01) — named money-in-hand masters (cash drawer,
 * bank accounts, UPI handles, card settlements) with running balances.
 * Amounts cross the wire in minor units (paise).
 *
 * ponytail: carries its own request() because lib/api.ts's helper is private;
 * extract a shared http helper if a third module needs one.
 */
import { ApiError, DEVICE_TOKEN_KEY, getAuthToken } from "./api";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (deviceToken) headers["X-Device-Token"] = deviceToken;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !(data as any).success) {
    throw new ApiError(
      (data as any)?.error ?? "Request failed",
      response.status,
      (data as any)?.details,
      data
    );
  }
  return (data as any).data as T;
}

export type PaymentAccountType = "cash" | "bank" | "upi" | "card";

export interface PaymentAccount {
  id: string;
  name: string;
  type: PaymentAccountType;
  storeId?: string | null;
  bankName?: string | null;
  ifsc?: string | null;
  accountNumberMasked?: string | null;
  accountHolder?: string | null;
  upiId?: string | null;
  openingBalanceMinor: number;
  currency: string;
  balanceMinor: number;
  createdAt: string | number;
}

export interface PaymentAccountInput {
  name: string;
  type: PaymentAccountType;
  storeId?: string;
  bankName?: string;
  ifsc?: string;
  accountNumberMasked?: string;
  accountHolder?: string;
  upiId?: string;
  openingBalanceMinor?: number;
}

export interface PaymentAccountStatementRow {
  id: string;
  direction: "in" | "out";
  amountMinor: number;
  reason?: string | null;
  refType?: string | null;
  refId?: string | null;
  createdAt: string | number;
  runningBalanceMinor: number;
}

export interface PaymentAccountStatement {
  account: PaymentAccount;
  openingMinor: number;
  closingMinor: number;
  rows: PaymentAccountStatementRow[];
}

export const paymentAccountsApi = {
  list: () => request<PaymentAccount[]>("/payment-accounts", "GET"),

  get: (id: string) => request<PaymentAccount>(`/payment-accounts/${encodeURIComponent(id)}`, "GET"),

  create: (data: PaymentAccountInput) => request<PaymentAccount>("/payment-accounts", "POST", data),

  update: (id: string, data: Partial<PaymentAccountInput>) =>
    request<PaymentAccount>(`/payment-accounts/${encodeURIComponent(id)}`, "PUT", data),

  remove: (id: string) =>
    request<{ message: string }>(`/payment-accounts/${encodeURIComponent(id)}`, "DELETE"),

  statement: (id: string, params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const qs = query.toString();
    return request<PaymentAccountStatement>(
      `/payment-accounts/${encodeURIComponent(id)}/statement${qs ? `?${qs}` : ""}`,
      "GET"
    );
  },

  adjust: (
    id: string,
    data: { direction: "add" | "reduce"; amountMinor: number; reason?: string }
  ) =>
    request<{ transaction: PaymentAccountStatementRow; balanceMinor: number }>(
      `/payment-accounts/${encodeURIComponent(id)}/adjust`,
      "POST",
      data
    ),
};
