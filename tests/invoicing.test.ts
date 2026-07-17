/*
 * Unit tests for the invoice-instalment engine: a small order bills in full at
 * confirmation; a large one splits into a deposit (at confirmation) and a
 * balance (at delivery), each with its own number, due date and payment state.
 */

import { describe, expect, it } from "vitest";
import { addDays, agingBuckets, invoicesFor, reminderLevel, type Instalment } from "../lib/engine/invoicing";
import type { Order, OrderEvent, OrderStatus } from "../lib/store";

const NOW = new Date("2026-07-13T12:00:00Z");

function order(over: Partial<Order> & { status: OrderStatus; gross: number }): Order {
  return {
    ref: "AX-TEST01",
    kind: "order",
    createdAt: "2026-06-01",
    customer: { name: "Demo", email: "demo@example.ch", street: "Weg 1", city: "6300 Zug" },
    system: "bars",
    lengthM: 6,
    ...over,
  };
}

const ev = (type: string, at: string): OrderEvent => ({ ref: "AX-TEST01", at, type: type as OrderEvent["type"], emailTo: "demo@example.ch" });

describe("addDays", () => {
  it("advances an ISO date and rolls over months", () => {
    expect(addDays("2026-07-13", 30)).toBe("2026-08-12");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });
});

describe("invoicesFor", () => {
  it("returns nothing for a quote", () => {
    expect(invoicesFor(order({ kind: "quote", status: "quote_requested", gross: 5000 }), [], undefined, NOW)).toEqual([]);
  });

  it("returns nothing for a cancelled order", () => {
    expect(invoicesFor(order({ status: "cancelled", gross: 6412.35 }), [ev("confirmed", "2026-07-01 09:00")], undefined, NOW)).toEqual([]);
  });

  it("bills a small order (<= threshold) in full from the order date", () => {
    const inv = invoicesFor(order({ status: "confirmed", gross: 1493.6, createdAt: "2026-07-01" }), [ev("created", "2026-07-01 09:00")], undefined, NOW);
    expect(inv).toHaveLength(1);
    expect(inv[0].kind).toBe("full");
    expect(inv[0].no).toBe("RE-TEST01");
    expect(inv[0].amount).toBe(1493.6);
    expect(inv[0].issuedAt).toBe("2026-07-01");
    expect(inv[0].dueDate).toBe("2026-07-31");
    expect(inv[0].state).toBe("sent");
  });

  it("splits a large order into deposit + balance summing to gross", () => {
    const inv = invoicesFor(order({ status: "new", gross: 6412.35, createdAt: "2026-07-10", depositPaidAt: "2026-07-10" }), [], undefined, NOW);
    expect(inv.map((i) => i.kind)).toEqual(["deposit", "balance"]);
    expect(inv[0].no).toBe("RE-TEST01-A");
    expect(inv[1].no).toBe("RE-TEST01-B");
    expect(inv[0].amount + inv[1].amount).toBeCloseTo(6412.35, 2);
    expect(inv[0].amount).toBe(3206.18);
    expect(inv[1].amount).toBe(3206.17);
    // The deposit is paid online with the order; the balance is not issued yet.
    expect(inv[0].state).toBe("paid");
    expect(inv[1].state).toBe("pending");
  });

  it("issues the deposit with the order itself, balance still pending", () => {
    const inv = invoicesFor(
      order({ status: "confirmed", gross: 6412.35, createdAt: "2026-07-05", deliveryDate: "2026-08-28" }),
      [ev("created", "2026-07-05 10:00"), ev("confirmed", "2026-07-06 10:00")],
      undefined,
      NOW,
    );
    expect(inv[0].issuedAt).toBe("2026-07-05");
    expect(inv[0].dueDate).toBe("2026-08-04");
    expect(inv[0].state).toBe("sent");
    expect(inv[1].issuedAt).toBeUndefined();
    expect(inv[1].state).toBe("pending");
  });

  it("issues the balance at shipping, due at the delivery date + net days", () => {
    const inv = invoicesFor(
      order({ status: "shipped", gross: 6412.35, deliveryDate: "2026-08-28" }),
      [ev("confirmed", "2026-07-05 10:00"), ev("shipped", "2026-08-20 14:00")],
      undefined,
      NOW,
    );
    expect(inv[1].issuedAt).toBe("2026-08-20");
    // due basis is the delivery date, not the shipping event
    expect(inv[1].dueDate).toBe("2026-09-27");
    expect(inv[1].state).toBe("sent");
  });

  it("marks an instalment paid from the order markers", () => {
    const inv = invoicesFor(
      order({ status: "shipped", gross: 6412.35, deliveryDate: "2026-08-28", depositPaidAt: "2026-07-20" }),
      [ev("confirmed", "2026-07-05 10:00"), ev("shipped", "2026-08-20 14:00")],
      undefined,
      NOW,
    );
    expect(inv[0].state).toBe("paid");
    expect(inv[0].paidAt).toBe("2026-07-20");
    expect(inv[1].state).toBe("sent");
  });

  it("flags an issued, unpaid, past-due invoice as overdue", () => {
    // ordered long ago, deposit due before NOW, never paid (legacy record)
    const inv = invoicesFor(
      order({ status: "confirmed", gross: 6412.35, createdAt: "2026-05-01", deliveryDate: "2026-08-28" }),
      [ev("created", "2026-05-01 10:00")],
      undefined,
      NOW,
    );
    expect(inv[0].dueDate).toBe("2026-05-31");
    expect(inv[0].state).toBe("overdue");
  });

  it("carries the dunning trail per instalment", () => {
    const inv = invoicesFor(
      order({
        status: "shipped",
        gross: 6412.35,
        createdAt: "2026-05-01",
        deliveryDate: "2026-06-01",
        depositPaidAt: "2026-05-01",
        reminders: { balance: ["2026-07-05", "2026-07-12"] },
      }),
      [ev("created", "2026-05-01 10:00"), ev("shipped", "2026-06-01 10:00")],
      undefined,
      NOW,
    );
    expect(inv[0].reminders).toEqual([]);
    expect(inv[1].reminders).toEqual(["2026-07-05", "2026-07-12"]);
    expect(reminderLevel(inv[1].reminders)).toBe(2);
    expect(reminderLevel([])).toBe(0);
    expect(reminderLevel(["a", "b", "c", "d"])).toBe(3);
  });

  it("falls back to the order date when a confirmed order has no event trail", () => {
    const inv = invoicesFor(order({ status: "confirmed", gross: 1493.6, createdAt: "2026-06-01" }), [], undefined, NOW);
    expect(inv[0].issuedAt).toBe("2026-06-01");
    expect(inv[0].dueDate).toBe("2026-07-01");
  });
});

describe("agingBuckets (AR aging report)", () => {
  const inst = (over: Partial<Instalment>): Instalment => ({
    kind: "balance",
    no: "RE-X",
    amount: 100,
    reminders: [],
    state: "sent",
    ...over,
  });
  const TODAY = "2026-07-17";

  it("groups issued unpaid instalments by days overdue", () => {
    const buckets = agingBuckets(
      [
        inst({ issuedAt: "2026-07-01", dueDate: "2026-07-31" }), // not due yet → current
        inst({ issuedAt: "2026-06-01", dueDate: "2026-07-01", amount: 200 }), // 16 d → 1–30
        inst({ issuedAt: "2026-05-01", dueDate: "2026-05-31", amount: 300 }), // 47 d → 31–60
        inst({ issuedAt: "2026-04-01", dueDate: "2026-04-20", amount: 400 }), // 88 d → 61–90
        inst({ issuedAt: "2026-01-01", dueDate: "2026-01-31", amount: 500 }), // 167 d → 90+
      ],
      TODAY,
    );
    expect(buckets.map((b) => b.amount)).toEqual([100, 200, 300, 400, 500]);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1, 1]);
  });

  it("ignores paid and not-yet-issued instalments", () => {
    const buckets = agingBuckets(
      [
        inst({ issuedAt: "2026-06-01", dueDate: "2026-07-01", paidAt: "2026-06-20" }),
        inst({ issuedAt: undefined, dueDate: undefined, state: "pending" }),
      ],
      TODAY,
    );
    expect(buckets.every((b) => b.amount === 0 && b.count === 0)).toBe(true);
  });

  it("counts the due date itself as current", () => {
    const buckets = agingBuckets([inst({ issuedAt: "2026-06-17", dueDate: "2026-07-17" })], TODAY);
    expect(buckets[0].count).toBe(1);
    expect(buckets[1].count).toBe(0);
  });
});
