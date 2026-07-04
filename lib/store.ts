/*
 * Prototype persistence: orders, price-book overrides and the demo session
 * live in the browser (localStorage). The shapes mirror the production
 * database tables so the portal/admin UIs carry over unchanged.
 */

import { defaultPriceBook, type PriceBook } from "./engine/pricing";
import type { RailingConfig } from "./engine/types";

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
}

export function updateOrderStatus(ref: string, status: OrderStatus): void {
  // Seeded fixtures are read-only templates; materialise the change as an
  // override entry so it survives reloads.
  const raw = localStorage.getItem(ORDERS_KEY);
  const own: Order[] = raw ? JSON.parse(raw) : [];
  const idx = own.findIndex((o) => o.ref === ref);
  if (idx >= 0) {
    own[idx].status = status;
  } else {
    const seed = seedOrders.find((o) => o.ref === ref);
    if (seed) own.push({ ...seed, status, seeded: false });
  }
  localStorage.setItem(ORDERS_KEY, JSON.stringify(own));
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
