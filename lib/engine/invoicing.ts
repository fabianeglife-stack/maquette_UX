/*
 * Invoice instalments for an order. AxioForm bills a small order in full at
 * confirmation; a larger one (above the price-book threshold) is split into a
 * deposit invoice sent at confirmation and a balance invoice sent at delivery
 * (the "shipped" transition). This pure module derives, from an order snapshot
 * plus its event timeline and the two paid markers, the concrete invoices with
 * their numbers, amounts, issue/due dates and payment state — so the Finance
 * ledger, the order drawer and the customer portal all agree.
 */

import { paymentPlan, type PriceBook } from "./pricing";
import { invoiceNoFor, ORDER_FLOW, type Order, type OrderEvent, type OrderStatus } from "../store";

export type InstalmentKind = "deposit" | "balance" | "full";
export type InstalmentState = "pending" | "sent" | "paid" | "overdue";

export interface Instalment {
  kind: InstalmentKind;
  /** Deterministic invoice number (RE-<ref>, or …-A / …-B for the two parts). */
  no: string;
  /** Amount incl. VAT (a share of the order gross). */
  amount: number;
  /** yyyy-mm-dd once the invoice has been issued (sent), else undefined. */
  issuedAt?: string;
  /** yyyy-mm-dd payment due date (issue/delivery + net days). */
  dueDate?: string;
  /** yyyy-mm-dd when marked paid, else undefined. */
  paidAt?: string;
  /** Dunning trail: dates of the reminders sent for this instalment. */
  reminders: string[];
  state: InstalmentState;
}

/** Dunning escalation from the reminder count: 0 none, 1 R1, 2 R2, 3+ formal notice. */
export function reminderLevel(reminders: string[]): 0 | 1 | 2 | 3 {
  return Math.min(reminders.length, 3) as 0 | 1 | 2 | 3;
}

/** One receivables-aging bucket: outstanding amount + invoice count. */
export interface AgingBucket {
  /** Stable id: current | d30 | d60 | d90 | d90plus. */
  id: "current" | "d30" | "d60" | "d90" | "d90plus";
  amount: number;
  count: number;
}

/**
 * Receivables aging: issued, unpaid instalments grouped by how many days they
 * are past due (the classic AR aging report). "current" = issued but not due
 * yet; then 1–30, 31–60, 61–90 and 90+ days overdue.
 */
export function agingBuckets(instalments: Instalment[], today: string = new Date().toISOString().slice(0, 10)): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { id: "current", amount: 0, count: 0 },
    { id: "d30", amount: 0, count: 0 },
    { id: "d60", amount: 0, count: 0 },
    { id: "d90", amount: 0, count: 0 },
    { id: "d90plus", amount: 0, count: 0 },
  ];
  const dayMs = 86400000;
  for (const inv of instalments) {
    if (!inv.issuedAt || inv.paidAt) continue;
    const due = inv.dueDate ?? inv.issuedAt;
    const overdueDays = Math.floor((Date.parse(today) - Date.parse(due)) / dayMs);
    const b =
      overdueDays <= 0 ? buckets[0] : overdueDays <= 30 ? buckets[1] : overdueDays <= 60 ? buckets[2] : overdueDays <= 90 ? buckets[3] : buckets[4];
    b.amount += inv.amount;
    b.count += 1;
  }
  return buckets;
}

const DATE = /^\d{4}-\d{2}-\d{2}/;

/** yyyy-mm-dd of an ISO date/datetime string, or undefined if unparseable. */
function dayOf(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const m = DATE.exec(s);
  return m ? m[0] : undefined;
}

/** Add `days` to a yyyy-mm-dd date, returning yyyy-mm-dd. */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rank(status: OrderStatus): number {
  return ORDER_FLOW.indexOf(status);
}

/** Date of the first event of `type`, as yyyy-mm-dd. */
function eventDay(events: OrderEvent[] | undefined, type: string): string | undefined {
  return dayOf(events?.find((e) => e.type === type)?.at);
}

/**
 * The invoices for an order (empty for quotes). `now` is injectable for tests.
 */
export function invoicesFor(
  order: Order,
  events: OrderEvent[] = [],
  pb?: PriceBook,
  now: Date = new Date(),
): Instalment[] {
  // Quotes carry no invoices; a cancelled order never bills.
  if (order.kind !== "order" || order.status === "cancelled") return [];
  const plan = paymentPlan(order.quotedGross ?? order.gross, pb);
  const base = invoiceNoFor(order.ref);
  const today = now.toISOString().slice(0, 10);
  const orderRank = rank(order.status);

  const state = (issued: boolean, paidAt: string | undefined, dueDate: string | undefined): InstalmentState => {
    if (paidAt) return "paid";
    if (!issued) return "pending";
    return dueDate && today > dueDate ? "overdue" : "sent";
  };

  // First invoice — full amount (small order) or the deposit (split order).
  // It is due with the order itself (paid online at checkout in the current
  // flow), so it is issued at creation; legacy/seeded orders without a paid
  // marker simply show as outstanding from that date.
  const firstAt = eventDay(events, "created") ?? dayOf(order.createdAt);
  const first: Instalment = {
    kind: plan.split ? "deposit" : "full",
    no: plan.split ? `${base}-A` : base,
    amount: plan.deposit,
    issuedAt: firstAt,
    dueDate: firstAt ? addDays(firstAt, plan.netDays) : undefined,
    paidAt: dayOf(order.depositPaidAt),
    reminders: order.reminders?.deposit ?? [],
    state: "pending",
  };
  first.state = state(Boolean(firstAt), first.paidAt, first.dueDate);
  if (!plan.split) return [first];

  // Balance — issued at delivery ("shipped"); due at the delivery date + net.
  const balIssued = orderRank >= rank("shipped");
  const balAt = balIssued ? (eventDay(events, "shipped") ?? dayOf(order.deliveryDate) ?? dayOf(order.createdAt)) : undefined;
  const dueBasis = dayOf(order.deliveryDate) ?? balAt;
  const balance: Instalment = {
    kind: "balance",
    no: `${base}-B`,
    amount: plan.balance,
    issuedAt: balAt,
    dueDate: dueBasis ? addDays(dueBasis, plan.netDays) : undefined,
    paidAt: dayOf(order.balancePaidAt),
    reminders: order.reminders?.balance ?? [],
    state: "pending",
  };
  balance.state = state(balIssued, balance.paidAt, balance.dueDate);
  return [first, balance];
}

/** Which paid marker an instalment kind writes to. */
export function paidField(kind: InstalmentKind): "depositPaidAt" | "balancePaidAt" {
  return kind === "balance" ? "balancePaidAt" : "depositPaidAt";
}
