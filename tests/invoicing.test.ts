/*
 * Unit tests for the invoice-instalment engine: a small order bills in full at
 * confirmation; a large one splits into a deposit (at confirmation) and a
 * balance (at delivery), each with its own number, due date and payment state.
 */

import { describe, expect, it } from "vitest";
import { addDays, invoicesFor } from "../lib/engine/invoicing";
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

  it("bills a small order (<= threshold) in full at confirmation", () => {
    const inv = invoicesFor(order({ status: "confirmed", gross: 1493.6 }), [ev("confirmed", "2026-07-01 09:00")], undefined, NOW);
    expect(inv).toHaveLength(1);
    expect(inv[0].kind).toBe("full");
    expect(inv[0].no).toBe("RE-TEST01");
    expect(inv[0].amount).toBe(1493.6);
    expect(inv[0].issuedAt).toBe("2026-07-01");
    expect(inv[0].dueDate).toBe("2026-07-31");
    expect(inv[0].state).toBe("sent");
  });

  it("splits a large order into deposit + balance summing to gross", () => {
    const inv = invoicesFor(order({ status: "new", gross: 6412.35 }), [], undefined, NOW);
    expect(inv.map((i) => i.kind)).toEqual(["deposit", "balance"]);
    expect(inv[0].no).toBe("RE-TEST01-A");
    expect(inv[1].no).toBe("RE-TEST01-B");
    expect(inv[0].amount + inv[1].amount).toBeCloseTo(6412.35, 2);
    expect(inv[0].amount).toBe(3206.18);
    expect(inv[1].amount).toBe(3206.17);
    // A "new" order has issued neither invoice yet.
    expect(inv[0].state).toBe("pending");
    expect(inv[1].state).toBe("pending");
  });

  it("issues the deposit at confirmation, balance still pending", () => {
    const inv = invoicesFor(
      order({ status: "confirmed", gross: 6412.35, deliveryDate: "2026-08-28" }),
      [ev("confirmed", "2026-07-05 10:00")],
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
    // confirmed long ago, deposit due before NOW, unpaid
    const inv = invoicesFor(
      order({ status: "confirmed", gross: 6412.35, deliveryDate: "2026-08-28" }),
      [ev("confirmed", "2026-05-01 10:00")],
      undefined,
      NOW,
    );
    expect(inv[0].dueDate).toBe("2026-05-31");
    expect(inv[0].state).toBe("overdue");
  });

  it("falls back to the order date when a confirmed order has no event trail", () => {
    const inv = invoicesFor(order({ status: "confirmed", gross: 1493.6, createdAt: "2026-06-01" }), [], undefined, NOW);
    expect(inv[0].issuedAt).toBe("2026-06-01");
    expect(inv[0].dueDate).toBe("2026-07-01");
  });
});
