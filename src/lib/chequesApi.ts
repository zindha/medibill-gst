/**
 * Cheque register API — issued and received post-dated cheques.
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

export type ChequeDirection = "issued" | "received";
export type ChequePartyType = "customer" | "supplier" | "other";
export type ChequeStatus = "pending" | "cleared" | "bounced" | "cancelled";

export interface Cheque {
  id: string;
  direction: ChequeDirection;
  partyType: ChequePartyType;
  partyName: string;
  accountId?: string | null;
  accountName?: string | null;
  chequeNo: string;
  bankName?: string | null;
  amountMinor: number;
  issueDate: string;
  dueDate: string;
  status: ChequeStatus;
  clearedAt?: string | number | null;
  notes?: string | null;
  createdAt: string | number;
}

export interface ChequeInput {
  direction: ChequeDirection;
  partyType: ChequePartyType;
  partyName: string;
  accountId?: string;
  chequeNo: string;
  bankName?: string;
  amountMinor: number;
  issueDate: string;
  dueDate: string;
  notes?: string;
}

export const chequesApi = {
  list: (params?: { status?: ChequeStatus; direction?: ChequeDirection; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.direction) query.set("direction", params.direction);
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    return request<{ rows: Cheque[]; count: number }>(`/cheques?${query}`, "GET");
  },

  create: (data: ChequeInput) => request<Cheque>("/cheques", "POST", data),

  /** pending → cleared | bounced | cancelled (one-way). */
  setStatus: (id: string, status: Exclude<ChequeStatus, "pending">) =>
    request<{ cheque: Cheque; transaction: { id: string; direction: "in" | "out" } | null }>(
      `/cheques/${encodeURIComponent(id)}/status`,
      "POST",
      { status }
    ),
};
