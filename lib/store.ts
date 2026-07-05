/*
 * Prototype persistence: orders, price-book overrides and the demo session
 * live in the browser (localStorage). The shapes mirror the production
 * database tables so the portal/admin UIs carry over unchanged.
 */

import { defaultPriceBook, type PriceBook } from "./engine/pricing";
import { builtinTypes, type RailingConfig, type TypeProfile } from "./engine/types";

export type OrderKind = "order" | "quote";
export type OrderStatus = "new" | "confirmed" | "production" | "shipped" | "quote_requested" | "quoted";

export const ORDER_FLOW: OrderStatus[] = ["new", "confirmed", "production", "shipped"];
export const QUOTE_FLOW: OrderStatus[] = ["quote_requested", "quoted"];

export interface Order {
  ref: string;
  kind: OrderKind;
  createdAt: string; // ISO date
  status: OrderStatus;
  customer: { name: string; email: string; street: string; city: string };
  payment?: "card" | "twint" | "invoice";
  system: "bars" | "glass";
  lengthM: number;
  gross: number;
  /** Binding price set by the admin when quoting; becomes `gross` on acceptance. */
  quotedGross?: number;
  config?: RailingConfig;
  seeded?: boolean;
}

const ORDERS_KEY = "axioform-orders-v1";
const PB_KEY = "axioform-pricebook-v1";
const SESSION_KEY = "axioform-session-v1";

/* ---------- orders ---------- */

const seedOrders: Order[] = [
  {
    ref: "AX-D8K2F1", kind: "order", createdAt: "2026-06-12", status: "shipped", seeded: true,
    customer: { name: "M. Keller", email: "m.keller@example.ch", street: "Seestrasse 41", city: "8802 Kilchberg" },
    payment: "card", system: "glass", lengthM: 12.4, gross: 6412.35,
  },
  {
    ref: "AX-E3M9Q7", kind: "order", createdAt: "2026-06-24", status: "production", seeded: true,
    customer: { name: "Atelier Brunner AG", email: "bau@brunner.example.ch", street: "Werkhofweg 3", city: "3013 Bern" },
    payment: "invoice", system: "bars", lengthM: 26, gross: 7250.1,
  },
  {
    ref: "AX-F7T2B4", kind: "order", createdAt: "2026-07-01", status: "confirmed", seeded: true,
    customer: { name: "S. Aebischer", email: "s.aebischer@example.ch", street: "Lindenweg 8", city: "6300 Zug" },
    payment: "twint", system: "bars", lengthM: 5.2, gross: 1493.6,
  },
  {
    ref: "AX-G1P5R9", kind: "quote", createdAt: "2026-07-03", status: "quote_requested", seeded: true,
    customer: { name: "Hotel Alpina", email: "technik@alpina.example.ch", street: "Via Maistra 12", city: "7500 St. Moritz" },
    system: "bars", lengthM: 56, gross: 15890.4,
  },
  {
    ref: "AX-H4W8S2", kind: "quote", createdAt: "2026-06-28", status: "quoted", seeded: true,
    customer: { name: "Baugenossenschaft Rütli", email: "verwaltung@ruetli.example.ch", street: "Am Rain 5", city: "6003 Luzern" },
    system: "glass", lengthM: 18.5, gross: 10240.8, quotedGross: 9840,
  },
];

export function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const own: Order[] = raw ? JSON.parse(raw) : [];
    // Own entries win over seeded fixtures with the same ref (status overrides).
    return dedupeOrders([...own, ...seedOrders]).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [...seedOrders];
  }
}

export function saveOrder(order: Order): void {
  const raw = localStorage.getItem(ORDERS_KEY);
  const own: Order[] = raw ? JSON.parse(raw) : [];
  own.push(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(own));
  logEvent(order.ref, "created", order.customer.email);
}

export function updateOrder(ref: string, patch: Partial<Order>): void {
  // Seeded fixtures are read-only templates; materialise the change as an
  // override entry so it survives reloads.
  const raw = localStorage.getItem(ORDERS_KEY);
  const own: Order[] = raw ? JSON.parse(raw) : [];
  const idx = own.findIndex((o) => o.ref === ref);
  if (idx >= 0) {
    own[idx] = { ...own[idx], ...patch };
  } else {
    const seed = seedOrders.find((o) => o.ref === ref);
    if (seed) own.push({ ...seed, ...patch, seeded: false });
  }
  localStorage.setItem(ORDERS_KEY, JSON.stringify(own));
}

export function updateOrderStatus(ref: string, status: OrderStatus): void {
  const order = loadOrders().find((o) => o.ref === ref);
  updateOrder(ref, { status });
  logEvent(ref, status, order?.customer.email);
}

/** Customer accepts a binding quote: it converts into a confirmed order. */
export function acceptQuote(ref: string): void {
  const q = loadOrders().find((o) => o.ref === ref);
  if (!q || q.kind !== "quote") return;
  updateOrder(ref, { kind: "order", status: "confirmed", gross: q.quotedGross ?? q.gross, payment: "invoice" });
  logEvent(ref, "quote_accepted", q.customer.email);
}

export function dedupeOrders(orders: Order[]): Order[] {
  const seen = new Set<string>();
  return orders.filter((o) => (seen.has(o.ref) ? false : (seen.add(o.ref), true)));
}

export function newRef(): string {
  return "AX-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/* ---------- price book ---------- */

export function loadPriceBook(): PriceBook {
  try {
    const raw = localStorage.getItem(PB_KEY);
    if (!raw) return defaultPriceBook;
    return { ...defaultPriceBook, ...(JSON.parse(raw) as PriceBook) };
  } catch {
    return defaultPriceBook;
  }
}

export function savePriceBook(pb: PriceBook): void {
  localStorage.setItem(PB_KEY, JSON.stringify({ ...pb, version: "PB-custom-" + new Date().toISOString().slice(0, 10) }));
}

export function resetPriceBook(): void {
  localStorage.removeItem(PB_KEY);
}

/* ---------- guardrail types ---------- */

const TYPES_KEY = "axioform-types-v1";

export function loadCustomTypes(): TypeProfile[] {
  try {
    const raw = localStorage.getItem(TYPES_KEY);
    return raw ? (JSON.parse(raw) as TypeProfile[]) : [];
  } catch {
    return [];
  }
}

export function loadAllTypes(): TypeProfile[] {
  return [...builtinTypes, ...loadCustomTypes()];
}

export function findType(id: string | undefined, fallbackTemplate: "bars" | "glass"): TypeProfile {
  const all = loadAllTypes();
  return all.find((t) => t.id === id) ?? all.find((t) => t.id === fallbackTemplate)!;
}

export function saveCustomType(tp: TypeProfile): void {
  const customs = loadCustomTypes();
  const idx = customs.findIndex((t) => t.id === tp.id);
  if (idx >= 0) customs[idx] = tp;
  else customs.push(tp);
  localStorage.setItem(TYPES_KEY, JSON.stringify(customs));
}

export function deleteCustomType(id: string): void {
  localStorage.setItem(TYPES_KEY, JSON.stringify(loadCustomTypes().filter((t) => t.id !== id)));
}

/* ---------- order events & mock email outbox ---------- */

const EVENTS_KEY = "axioform-events-v1";

export type OrderEventType = OrderStatus | "created" | "quote_accepted";

export interface OrderEvent {
  ref: string;
  at: string; // ISO datetime
  type: OrderEventType;
  /** Set when the production system would send a transactional email. */
  emailTo?: string;
}

export function logEvent(ref: string, type: OrderEventType, emailTo?: string): void {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const events: OrderEvent[] = raw ? JSON.parse(raw) : [];
    events.push({ ref, at: new Date().toISOString().slice(0, 16).replace("T", " "), type, emailTo });
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch {
    /* storage unavailable — drop the event */
  }
}

export function loadEvents(ref: string): OrderEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const events: OrderEvent[] = raw ? JSON.parse(raw) : [];
    return events.filter((e) => e.ref === ref);
  } catch {
    return [];
  }
}

/* ---------- CMS content overrides (references page) ---------- */

const CONTENT_KEY = "axioform-content-v1";

export interface RefProject {
  name: string;
  place: string;
  system: string;
  length: string;
  mounting: string;
  desc: string;
}

export interface ContentState {
  /** Sparse overrides for the seeded reference projects, by index. */
  projects: Record<number, Partial<RefProject>>;
  /** Admin-created reference projects, appended after the seeded ones. */
  added: RefProject[];
}

export function loadContent(): ContentState {
  try {
    const raw = localStorage.getItem(CONTENT_KEY);
    return raw ? (JSON.parse(raw) as ContentState) : { projects: {}, added: [] };
  } catch {
    return { projects: {}, added: [] };
  }
}

export function saveContent(c: ContentState): void {
  localStorage.setItem(CONTENT_KEY, JSON.stringify(c));
}

export function mergedProjects(base: RefProject[]): RefProject[] {
  const c = loadContent();
  return [...base.map((p, i) => ({ ...p, ...(c.projects[i] ?? {}) })), ...c.added];
}

/* ---------- B2B trade tiers ---------- */

const TIERS_KEY = "axioform-tiers-v1";

export type Tier = "standard" | "partner" | "pro";
export const TIER_DISCOUNT: Record<Tier, number> = { standard: 0, partner: 0.05, pro: 0.1 };

export function loadTiers(): Record<string, Tier> {
  try {
    const raw = localStorage.getItem(TIERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Tier>) : {};
  } catch {
    return {};
  }
}

export function setTier(email: string, tier: Tier): void {
  const tiers = loadTiers();
  if (tier === "standard") delete tiers[email.toLowerCase()];
  else tiers[email.toLowerCase()] = tier;
  localStorage.setItem(TIERS_KEY, JSON.stringify(tiers));
}

export function tierFor(email: string | undefined | null): Tier {
  if (!email) return "standard";
  return loadTiers()[email.toLowerCase()] ?? "standard";
}

/* ---------- saved configurations & share links ---------- */

const SAVED_KEY = "axioform-saved-v1";

export interface SavedConfig {
  id: string;
  name: string;
  createdAt: string; // ISO date
  config: RailingConfig;
}

export function loadSavedConfigs(): SavedConfig[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedConfig[]) : [];
  } catch {
    return [];
  }
}

export function saveSavedConfig(name: string, config: RailingConfig): SavedConfig {
  const entry: SavedConfig = {
    id: "sc-" + Math.random().toString(36).slice(2, 8),
    name,
    createdAt: new Date().toISOString().slice(0, 10),
    config,
  };
  localStorage.setItem(SAVED_KEY, JSON.stringify([entry, ...loadSavedConfigs()]));
  return entry;
}

export function deleteSavedConfig(id: string): void {
  localStorage.setItem(SAVED_KEY, JSON.stringify(loadSavedConfigs().filter((s) => s.id !== id)));
}

/** URL-safe base64 of the config JSON — the payload of `?c=` share links. */
export function encodeConfig(config: RailingConfig): string {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(payload: string): RailingConfig | null {
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64)))) as RailingConfig;
  } catch {
    return null;
  }
}

/* ---------- demo session ---------- */

export function setSession(email: string): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email, at: Date.now() }));
}

export function getSession(): { email: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as { email: string }) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
