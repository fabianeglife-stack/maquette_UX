/*
 * Prototype persistence: orders, price-book overrides and the demo session
 * live in the browser (localStorage). The shapes mirror the production
 * database tables so the portal/admin UIs carry over unchanged.
 */

import { defaultPriceBook, type PriceBook } from "./engine/pricing";
import { builtinTypes, SUBSTRATE_MOUNTING, type RailingConfig, type Substrate, type TypeProfile } from "./engine/types";

export type OrderKind = "order" | "quote";
export type OrderStatus =
  | "new"
  | "confirmed"
  | "production"
  | "shipped"
  | "invoiced"
  | "paid"
  | "quote_requested"
  | "quoted"
  // Terminal state outside the linear flows: a withdrawn order or declined
  // quote. Orders can be cancelled while new (customer) or new/confirmed
  // (staff); later stages are committed to production.
  | "cancelled";

export const ORDER_FLOW: OrderStatus[] = ["new", "confirmed", "production", "shipped", "invoiced", "paid"];

/** Deterministic invoice number for an order (no schema field needed). */
export function invoiceNoFor(ref: string): string {
  return "RE-" + ref.replace(/^AX-/, "");
}
/** Deterministic delivery-note number for an order. */
export function deliveryNoFor(ref: string): string {
  return "LS-" + ref.replace(/^AX-/, "");
}
/** Deterministic order-confirmation number for an order. */
export function confirmationNoFor(ref: string): string {
  return "AB-" + ref.replace(/^AX-/, "");
}
/** Deterministic quote/offer number for a request. */
export function quoteNoFor(ref: string): string {
  return "OF-" + ref.replace(/^AX-/, "");
}
/** Deterministic material purchase-order number for an order. */
export function materialNoFor(ref: string): string {
  return "BM-" + ref.replace(/^AX-/, "");
}
/** Deterministic treatment purchase-order number for an order. */
export function treatmentNoFor(ref: string): string {
  return "BT-" + ref.replace(/^AX-/, "");
}
/** Days a binding quote stays valid after it is sent. */
export const QUOTE_VALID_DAYS = 30;
/** Whether a binding quote has passed its validity date. */
export function isQuoteExpired(o: Pick<Order, "validUntil">, today: string = new Date().toISOString().slice(0, 10)): boolean {
  return Boolean(o.validUntil && today > o.validUntil);
}
export const QUOTE_FLOW: OrderStatus[] = ["quote_requested", "quoted"];

export interface Order {
  ref: string;
  kind: OrderKind;
  createdAt: string; // ISO date
  status: OrderStatus;
  customer: {
    name: string;
    email: string;
    street: string;
    city: string;
    /** Contact number for delivery/installation coordination. */
    phone?: string;
    /** Delivery/site address when it differs from the billing address. */
    deliveryStreet?: string;
    deliveryCity?: string;
  };
  payment?: "card" | "twint" | "invoice";
  system: "bars" | "glass";
  lengthM: number;
  gross: number;
  /** Binding price set by the admin when quoting; becomes `gross` on acceptance. */
  quotedGross?: number;
  /** Last day (ISO yyyy-mm-dd) a binding quote can be accepted. */
  validUntil?: string;
  /** Estimated delivery date (ISO yyyy-mm-dd), entered by staff before confirmation. */
  deliveryDate?: string;
  /** Plan-approval stage: date the detail plans went out for sign-off … */
  plansSentAt?: string;
  /** … and the date the customer approved them (gates the confirmation). */
  plansApprovedAt?: string;
  /** Procurement & logistics milestones — see MILESTONES for the chain. */
  materialOrderedAt?: string;
  treatmentOrderedAt?: string;
  materialReceivedAt?: string;
  treatmentSentAt?: string;
  treatmentReceivedAt?: string;
  /** Final inspection (dimensions, welds, finish) — gates palletizing. */
  qcPassedAt?: string;
  palletizedAt?: string;
  /** Shipment details + proof of delivery (recipient at handover). */
  carrier?: string;
  trackingNo?: string;
  deliveredAt?: string;
  deliveredTo?: string;
  /** Payment markers (ISO yyyy-mm-dd) for the deposit/full and balance invoices. */
  depositPaidAt?: string;
  balancePaidAt?: string;
  /** Dunning trail: reminder dates (ISO) per instalment. */
  reminders?: { deposit?: string[]; balance?: string[] };
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
    payment: "invoice", system: "bars", lengthM: 26, gross: 7250.1, deliveryDate: "2026-07-10",
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
  if (!q || q.kind !== "quote" || isQuoteExpired(q)) return;
  updateOrder(ref, { kind: "order", status: "confirmed", gross: q.quotedGross ?? q.gross, payment: "invoice" });
  logEvent(ref, "quote_accepted", q.customer.email);
}

/** Staff sends the detail plans to the customer for sign-off. */
export function sendPlans(ref: string): void {
  const o = loadOrders().find((x) => x.ref === ref);
  if (!o || o.kind !== "order" || o.status !== "new" || !o.config) return;
  updateOrder(ref, { plansSentAt: new Date().toISOString().slice(0, 10), plansApprovedAt: undefined });
  logEvent(ref, "plans_sent", o.customer.email);
}

/** Customer approves the detail plans — unlocks the order confirmation. */
export function approvePlans(ref: string): void {
  const o = loadOrders().find((x) => x.ref === ref);
  if (!o || o.kind !== "order" || o.status !== "new" || !o.plansSentAt || o.plansApprovedAt) return;
  updateOrder(ref, { plansApprovedAt: new Date().toISOString().slice(0, 10) });
  logEvent(ref, "plans_approved", o.customer.email);
}

/* ---------- procurement & logistics milestones ---------- */

export type Milestone =
  | "material_ordered"
  | "treatment_ordered"
  | "material_received"
  | "treatment_sent"
  | "treatment_received"
  | "qc_passed"
  | "palletized"
  | "delivered";

/** The pre-shipment chain shown in the order-drawer checklist. */
export const MILESTONES: Milestone[] = [
  "material_ordered",
  "treatment_ordered",
  "material_received",
  "treatment_sent",
  "treatment_received",
  "qc_passed",
  "palletized",
];

export const MILESTONE_FIELD = {
  material_ordered: "materialOrderedAt",
  treatment_ordered: "treatmentOrderedAt",
  material_received: "materialReceivedAt",
  treatment_sent: "treatmentSentAt",
  treatment_received: "treatmentReceivedAt",
  qc_passed: "qcPassedAt",
  palletized: "palletizedAt",
  delivered: "deliveredAt",
} as const satisfies Record<Milestone, keyof Order>;

/** Order-like shape shared by the client store and the DB row (server reuse). */
type MilestoneState = {
  kind: string;
  status: string;
  plansApprovedAt?: string | null;
  materialOrderedAt?: string | null;
  treatmentOrderedAt?: string | null;
  materialReceivedAt?: string | null;
  treatmentSentAt?: string | null;
  treatmentReceivedAt?: string | null;
  qcPassedAt?: string | null;
  palletizedAt?: string | null;
  deliveredAt?: string | null;
};

/**
 * Whether a milestone may be recorded now. Encodes the physical chain: both
 * POs after plan approval; goods receipt after the material PO; shipment to
 * the treatment plant only once fabricated (status ≥ production) and ordered;
 * return after shipment; the final inspection after the return; palletizing
 * after the passed inspection; delivery once the order has shipped.
 */
export function milestoneReady(o: MilestoneState, m: Milestone): boolean {
  if (o.kind !== "order" || o.status === "cancelled" || !o.plansApprovedAt) return false;
  if (o[MILESTONE_FIELD[m]]) return false;
  switch (m) {
    case "material_ordered":
    case "treatment_ordered":
      return true;
    case "material_received":
      return Boolean(o.materialOrderedAt);
    case "treatment_sent":
      return Boolean(o.treatmentOrderedAt) && ORDER_FLOW.indexOf(o.status as OrderStatus) >= ORDER_FLOW.indexOf("production");
    case "treatment_received":
      return Boolean(o.treatmentSentAt);
    case "qc_passed":
      return Boolean(o.treatmentReceivedAt);
    case "palletized":
      return Boolean(o.qcPassedAt);
    case "delivered":
      return ORDER_FLOW.indexOf(o.status as OrderStatus) >= ORDER_FLOW.indexOf("shipped");
  }
}

/**
 * An order is late when its promised delivery date has passed while it is
 * still on the shop floor (before shipping). Pure — shared by the ERP badges
 * and the dashboard KPI.
 */
export function isLate(
  o: Pick<Order, "kind" | "status" | "deliveryDate">,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (o.kind !== "order" || !o.deliveryDate) return false;
  if (!["new", "confirmed", "production"].includes(o.status)) return false;
  return o.deliveryDate < today;
}

/** Static-mode fallback: record a milestone (same chain rules as the API). */
export function markMilestone(ref: string, m: Milestone, deliveredTo?: string): void {
  const o = loadOrders().find((x) => x.ref === ref);
  if (!o || !milestoneReady(o, m)) return;
  updateOrder(ref, {
    [MILESTONE_FIELD[m]]: new Date().toISOString().slice(0, 10),
    ...(m === "delivered" && deliveredTo ? { deliveredTo } : {}),
  });
  logEvent(ref, m, o.customer.email);
}

/** Customer sends the plans back for revision — staff will re-send them. */
export function requestPlanChanges(ref: string): void {
  const o = loadOrders().find((x) => x.ref === ref);
  if (!o || o.kind !== "order" || o.status !== "new" || !o.plansSentAt || o.plansApprovedAt) return;
  updateOrder(ref, { plansSentAt: undefined });
  logEvent(ref, "plans_change_requested", o.customer.email);
}

/** Withdraw an order (while still in review) or decline a quote. */
export function cancelOrder(ref: string): void {
  const o = loadOrders().find((x) => x.ref === ref);
  if (!o || o.status === "cancelled") return;
  updateOrder(ref, { status: "cancelled" });
  logEvent(ref, "cancelled", o.customer.email);
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

export type OrderEventType =
  | OrderStatus
  | "created"
  | "quote_accepted"
  // Invoice dispatch hooks: the deposit/full invoice goes out at confirmation,
  // the balance invoice at delivery (shipping).
  | "deposit_sent"
  | "balance_sent"
  | "invoice_sent"
  // Online payment received with the order (deposit or full amount).
  | "deposit_paid"
  // Dunning: a payment reminder went out for an unpaid instalment.
  | "reminder_sent"
  // Plan approval: detail plans sent for sign-off, approved by the customer,
  // or sent back with a change request.
  | "plans_sent"
  | "plans_approved"
  | "plans_change_requested"
  // Procurement & logistics chain (see Milestone in this module).
  | Milestone;

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
  /** Legacy single project photo (compressed JPEG data URL). Superseded by `images`. */
  image?: string;
  /** Project gallery: compressed JPEG data URLs, first = cover. Falls back to an illustration. */
  images?: string[];
}

/** Normalised gallery for a project: `images` if present, else the legacy `image`, else []. */
export function projectImages(p: RefProject): string[] {
  if (p.images && p.images.length > 0) return p.images;
  return p.image ? [p.image] : [];
}

/* ---------- per-page CMS content (about, home) ---------- */

/** Sparse overrides for the About page; empty fields fall back to the i18n dict. */
export interface AboutContent {
  kicker?: string;
  title?: string;
  lead?: string;
  story?: string[];
  values?: { t: string; d: string }[];
  numbers?: { v: string; d: string }[];
  quote?: string;
  quoteAuthor?: string;
  /** Workshop/team photo gallery shown on the About page. */
  images?: string[];
}

/** Home page overrides. */
export interface HomeContent {
  /** Hero photo replacing the hero illustration when set (JPEG data URL). */
  heroImage?: string;
}

/**
 * Admin-uploaded principle drawings per guardrail type, wall situation
 * (substrate) and fixing (top = on the slab, side = lateral). The canonical
 * key is the combination "substrate|mounting"; bare-substrate and bare-mounting
 * keys are legacy uploads kept as fallbacks. Values are PDF data-URLs
 * (prototype) or hosted URLs; the type's built-in planUrl is the last resort.
 */
export type Mounting = "top" | "side";
export type PlanKey = `${Substrate}|${Mounting}` | Substrate | Mounting;
export type TypePlans = Record<string, Partial<Record<PlanKey, string>>>;

/**
 * Plan resolution: exact substrate|mounting combination → bare substrate
 * (legacy) → bare mounting (legacy) → the type's built-in planUrl.
 */
export function planFor(
  plans: TypePlans,
  typeId: string,
  substrate: Substrate,
  mounting?: Mounting,
  fallback?: string,
): string | undefined {
  const entry = plans[typeId];
  const m = mounting ?? SUBSTRATE_MOUNTING[substrate];
  return entry?.[`${substrate}|${m}`] ?? entry?.[substrate] ?? entry?.[m] ?? fallback;
}

/* ---------- supplier records for the purchase orders ---------- */

export interface SupplierInfo {
  name: string;
  street: string;
  city: string;
  email: string;
}

/** The two supplier slots the purchase orders are addressed to. */
export interface Suppliers {
  material: SupplierInfo;
  treatment: SupplierInfo;
}

/** Demo defaults; editable later via the CMS blob `suppliers`. */
export const DEFAULT_SUPPLIERS: Suppliers = {
  material: { name: "Stahlhandel Zug AG", street: "Industriestrasse 24", city: "6300 Zug", email: "verkauf@stahlzug.example.ch" },
  treatment: { name: "Verzinkerei & Pulverwerk Seetal AG", street: "Werkstrasse 8", city: "5703 Seon", email: "auftrag@seetal-zink.example.ch" },
};

export function loadPageContent<T>(id: string, empty: T): T {
  try {
    const raw = localStorage.getItem(`axioform-content-${id}-v1`);
    return raw ? { ...empty, ...(JSON.parse(raw) as T) } : empty;
  } catch {
    return empty;
  }
}

export function savePageContent<T>(id: string, c: T): void {
  localStorage.setItem(`axioform-content-${id}-v1`, JSON.stringify(c));
}

interface AboutBase {
  kicker: string;
  title: string;
  lead: string;
  story: string[];
  values: { t: string; d: string }[];
  numbers: { v: string; d: string }[];
  quote: string;
  quoteAuthor: string;
}

/** Overlay About overrides on the i18n defaults: non-empty scalars win, arrays replace wholesale. */
export function mergedAbout(base: AboutBase, o: AboutContent): AboutBase & { images: string[] } {
  const pick = (ov: string | undefined, def: string) => (ov && ov.trim() !== "" ? ov : def);
  return {
    kicker: pick(o.kicker, base.kicker),
    title: pick(o.title, base.title),
    lead: pick(o.lead, base.lead),
    story: o.story && o.story.length > 0 ? o.story : base.story,
    values: o.values && o.values.length > 0 ? o.values : base.values,
    numbers: o.numbers && o.numbers.length > 0 ? o.numbers : base.numbers,
    quote: pick(o.quote, base.quote),
    quoteAuthor: pick(o.quoteAuthor, base.quoteAuthor),
    images: o.images ?? [],
  };
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

/* ---------- company-portal collaborators (static prototype) ---------- */

const STAFF_KEY = "axioform-staff-v1";

export interface LocalStaff {
  email: string;
  name: string;
  role: "staff" | "admin";
  access: string[];
  active: boolean;
}

const seedStaff: LocalStaff[] = [
  { email: "admin@axioform.ch", name: "AxioForm Admin", role: "admin", access: [], active: true },
  { email: "production@axioform.ch", name: "Atelier Production", role: "staff", access: ["production"], active: true },
  { email: "logistique@axioform.ch", name: "Équipe Logistique", role: "staff", access: ["logistics"], active: true },
];

export function loadStaff(): LocalStaff[] {
  try {
    const raw = localStorage.getItem(STAFF_KEY);
    return raw ? (JSON.parse(raw) as LocalStaff[]) : [...seedStaff];
  } catch {
    return [...seedStaff];
  }
}

export function saveStaffMember(member: LocalStaff): void {
  const list = loadStaff();
  const i = list.findIndex((s) => s.email === member.email.toLowerCase());
  const next = { ...member, email: member.email.toLowerCase() };
  if (i >= 0) list[i] = next;
  else list.push(next);
  localStorage.setItem(STAFF_KEY, JSON.stringify(list));
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
