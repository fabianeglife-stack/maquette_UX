/*
 * Client adapter for the production API. `hasBackend` decides at build time
 * whether the apps talk to the server (full deployment) or to the browser
 * store in lib/store.ts (static prototype on GitHub Pages).
 */

import type { ContentState, Order, OrderEvent, SavedConfig, Tier } from "./store";
import type { RailingConfig, TypeProfile } from "./engine/types";
import type { PriceBook } from "./engine/pricing";

export const hasBackend = process.env.NEXT_PUBLIC_BACKEND === "1";

export interface SessionInfo {
  email: string;
  name: string;
  role: "customer" | "staff" | "admin";
  tier: Tier;
  /** Company-portal areas granted to staff accounts (empty for customers). */
  access?: string[];
}

export interface StaffRow {
  email: string;
  name: string;
  role: "staff" | "admin";
  access: string[];
  active: boolean;
}

export interface AuditRow {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface CustomerRow {
  name: string;
  city: string;
  email: string;
  orders: number;
  quotes: number;
  revenue: number;
  tier: Tier;
}

/** A persisted document (metadata only — the bytes are served separately). */
export interface DocumentMeta {
  id: string;
  slug: string;
  area: string;
  kind: string;
  no?: string | null;
  filename: string;
  createdAt: string;
}

/** Payload to persist a freshly generated document against an order. */
export interface DocumentInput {
  slug: string;
  area: string;
  kind: string;
  no?: string;
  filename: string;
  /** Full data URI from jsPDF (`data:application/pdf;…;base64,…`). */
  dataUri: string;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `http_${res.status}`);
  return data as T;
}

export type ApiOrder = Order & { events?: OrderEvent[] };

export const api = {
  signup: (email: string, password: string, name: string) =>
    call<SessionInfo>("POST", "/api/auth/signup/", { email, password, name }),
  login: (email: string, password: string) => call<SessionInfo>("POST", "/api/auth/login/", { email, password }),
  logout: () => call<{ ok: true }>("POST", "/api/auth/logout/"),
  me: () => call<{ user: SessionInfo | null }>("GET", "/api/auth/me/").then((r) => r.user),

  listOrders: () => call<{ orders: ApiOrder[] }>("GET", "/api/orders/").then((r) => r.orders),
  createOrder: (payload: {
    kind: "order" | "quote";
    config: RailingConfig;
    customer: Order["customer"];
    payment?: string;
  }) => call<{ order: ApiOrder }>("POST", "/api/orders/", payload).then((r) => r.order),
  patchOrder: (
    ref: string,
    patch: {
      status?: string;
      quotedGross?: number;
      accept?: boolean;
      cancel?: boolean;
      deliveryDate?: string;
      markPaid?: "deposit" | "balance";
      paidAt?: string;
      remind?: "deposit" | "balance";
    },
  ) => call<{ order: ApiOrder }>("PATCH", `/api/orders/${ref}/`, patch).then((r) => r.order),

  // Documents: the per-order binder persists generated PDFs so they can be
  // re-opened (served inline) instead of regenerated and downloaded each time.
  listDocuments: (ref: string) =>
    call<{ documents: DocumentMeta[] }>("GET", `/api/orders/${ref}/documents/`).then((r) => r.documents),
  saveDocument: (ref: string, payload: DocumentInput) =>
    call<{ document: DocumentMeta }>("POST", `/api/orders/${ref}/documents/`, payload).then((r) => r.document),
  /** URL of the stored bytes; opening it renders the PDF inline in a new tab. */
  documentUrl: (id: string) => `/api/documents/${id}/`,

  listCustomers: () => call<{ customers: CustomerRow[] }>("GET", "/api/customers/").then((r) => r.customers),
  setTier: (email: string, tier: Tier) => call<{ ok: true }>("PATCH", "/api/customers/", { email, tier }),

  listStaff: () => call<{ staff: StaffRow[]; audit: AuditRow[] }>("GET", "/api/staff/"),
  createStaff: (payload: { email: string; name: string; password: string; role: "staff" | "admin"; access: string[] }) =>
    call<{ staff: StaffRow }>("POST", "/api/staff/", payload).then((r) => r.staff),
  patchStaff: (email: string, patch: { role?: "staff" | "admin"; access?: string[]; active?: boolean; password?: string }) =>
    call<{ staff: StaffRow }>("PATCH", "/api/staff/", { email, ...patch }).then((r) => r.staff),

  listTypes: () => call<{ types: TypeProfile[] }>("GET", "/api/types/").then((r) => r.types),
  putType: (type: TypeProfile) => call<{ ok: true }>("PUT", "/api/types/", { type }),
  deleteType: (id: string) => call<{ ok: true }>("DELETE", `/api/types/${encodeURIComponent(id)}/`),

  getPriceBook: () => call<{ priceBook: PriceBook }>("GET", "/api/pricebook/").then((r) => r.priceBook),
  putPriceBook: (priceBook: PriceBook) =>
    call<{ priceBook: PriceBook }>("PUT", "/api/pricebook/", { priceBook }).then((r) => r.priceBook),
  resetPriceBook: () => call<{ priceBook: PriceBook }>("DELETE", "/api/pricebook/").then((r) => r.priceBook),

  getContent: () => call<{ content: ContentState }>("GET", "/api/content/").then((r) => r.content),
  putContent: (content: ContentState) => call<{ ok: true }>("PUT", "/api/content/", { id: "references", content }),
  getPageContent: <T,>(id: string) =>
    call<{ content: T }>("GET", `/api/content/?id=${encodeURIComponent(id)}`).then((r) => r.content),
  putPageContent: <T,>(id: string, content: T) => call<{ ok: true }>("PUT", "/api/content/", { id, content }),

  listConfigs: () => call<{ configs: SavedConfig[] }>("GET", "/api/configs/").then((r) => r.configs),
  createConfig: (name: string, config: RailingConfig) =>
    call<{ config: SavedConfig }>("POST", "/api/configs/", { name, config }).then((r) => r.config),
  deleteConfig: (id: string) => call<{ ok: true }>("DELETE", `/api/configs/${encodeURIComponent(id)}/`),
};
