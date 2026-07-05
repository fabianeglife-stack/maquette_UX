/*
 * Client adapter for the production API. `hasBackend` decides at build time
 * whether the apps talk to the server (full deployment) or to the browser
 * store in lib/store.ts (static prototype on GitHub Pages).
 */

import type { Order, OrderEvent, Tier } from "./store";
import type { RailingConfig, TypeProfile } from "./engine/types";

export const hasBackend = process.env.NEXT_PUBLIC_BACKEND === "1";

export interface SessionInfo {
  email: string;
  name: string;
  role: "customer" | "admin";
  tier: Tier;
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
    typeProfile?: TypeProfile;
    customer: Order["customer"];
    payment?: string;
  }) => call<{ order: ApiOrder }>("POST", "/api/orders/", payload).then((r) => r.order),
  patchOrder: (ref: string, patch: { status?: string; quotedGross?: number; accept?: boolean }) =>
    call<{ order: ApiOrder }>("PATCH", `/api/orders/${ref}/`, patch).then((r) => r.order),

  listCustomers: () => call<{ customers: CustomerRow[] }>("GET", "/api/customers/").then((r) => r.customers),
  setTier: (email: string, tier: Tier) => call<{ ok: true }>("PATCH", "/api/customers/", { email, tier }),
};
