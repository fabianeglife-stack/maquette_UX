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
  state: InstalmentState;
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
  // Issued at confirmation; falls back to the order date for seeded fixtures
  // that carry no event trail.
  const firstIssued = orderRank >= rank("confirmed");
  const firstAt = firstIssued ? (eventDay(events, "confirmed") ?? dayOf(order.createdAt)) : undefined;
  const first: Instalment = {
    kind: plan.split ? "deposit" : "full",
    no: plan.split ? `${base}-A` : base,
    amount: plan.deposit,
    issuedAt: firstAt,
    dueDate: firstAt ? addDays(firstAt, plan.netDays) : undefined,
    paidAt: dayOf(order.depositPaidAt),
    state: "pending",
  };
  first.state = state(firstIssued, first.paidAt, first.dueDate);
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
    state: "pending",
  };
  balance.state = state(balIssued, balance.paidAt, balance.dueDate);
  return [first, balance];
}

/** Which paid marker an instalment kind writes to. */
export function paidField(kind: InstalmentKind): "depositPaidAt" | "balancePaidAt" {
  return kind === "balance" ? "balancePaidAt" : "depositPaidAt";
}
