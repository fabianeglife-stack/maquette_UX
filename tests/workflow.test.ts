/*
 * Unit tests for the order-workflow rules exposed by lib/store: the
 * procurement/QC/logistics milestone chain (milestoneReady) and the
 * late-order flag (isLate).
 */

import { describe, expect, it } from "vitest";
import { isLate, MILESTONES, milestoneReady, type Milestone, type Order } from "../lib/store";

type Partial = Record<string, unknown>;
const order = (over: Partial): Order =>
  ({
    ref: "AX-TEST01",
    kind: "order",
    createdAt: "2026-06-01",
    status: "confirmed",
    customer: { name: "Demo", email: "d@e.ch", street: "W 1", city: "6300 Zug" },
    system: "bars",
    lengthM: 6,
    gross: 5000,
    plansApprovedAt: "2026-06-05",
    ...over,
  }) as Order;

describe("milestoneReady — the pre-shipment chain", () => {
  it("allows both POs right after plan approval, nothing downstream", () => {
    const o = order({});
    expect(milestoneReady(o, "material_ordered")).toBe(true);
    expect(milestoneReady(o, "treatment_ordered")).toBe(true);
    expect(milestoneReady(o, "material_received")).toBe(false);
    expect(milestoneReady(o, "qc_passed")).toBe(false);
    expect(milestoneReady(o, "palletized")).toBe(false);
  });

  it("gates goods receipt on the material PO", () => {
    expect(milestoneReady(order({ materialOrderedAt: "2026-06-06" }), "material_received")).toBe(true);
    expect(milestoneReady(order({}), "material_received")).toBe(false);
  });

  it("requires fabrication (status ≥ production) to ship to treatment", () => {
    const base = { treatmentOrderedAt: "2026-06-06" };
    expect(milestoneReady(order({ ...base, status: "confirmed" }), "treatment_sent")).toBe(false);
    expect(milestoneReady(order({ ...base, status: "production" }), "treatment_sent")).toBe(true);
  });

  it("inserts QC between the treatment return and palletizing", () => {
    const back = order({ status: "production", treatmentReceivedAt: "2026-06-20" });
    expect(milestoneReady(back, "qc_passed")).toBe(true);
    // Palletizing is blocked until QC has passed …
    expect(milestoneReady(back, "palletized")).toBe(false);
    // … and opens once it has.
    const qc = order({ status: "production", treatmentReceivedAt: "2026-06-20", qcPassedAt: "2026-06-21" });
    expect(milestoneReady(qc, "palletized")).toBe(true);
  });

  it("only allows delivery once the order has shipped", () => {
    expect(milestoneReady(order({ status: "production" }), "delivered")).toBe(false);
    expect(milestoneReady(order({ status: "shipped" }), "delivered")).toBe(true);
  });

  it("records nothing on a cancelled or plan-unapproved order", () => {
    expect(milestoneReady(order({ status: "cancelled" }), "material_ordered")).toBe(false);
    expect(milestoneReady(order({ plansApprovedAt: undefined, status: "new" }), "material_ordered")).toBe(false);
  });

  it("never re-fires a milestone that is already recorded", () => {
    expect(milestoneReady(order({ materialOrderedAt: "2026-06-06" }), "material_ordered")).toBe(false);
  });

  it("keeps the drawer checklist chain (delivery is a station action, not a checklist step)", () => {
    expect(MILESTONES).not.toContain("delivered" as Milestone);
    expect(MILESTONES).toContain("qc_passed");
  });
});

describe("isLate", () => {
  const NOW = "2026-07-13";
  it("flags an on-floor order past its delivery date", () => {
    expect(isLate(order({ status: "production", deliveryDate: "2026-07-01" }), NOW)).toBe(true);
    expect(isLate(order({ status: "confirmed", deliveryDate: "2026-07-20" }), NOW)).toBe(false);
  });
  it("does not flag shipped/paid orders or those without a promised date", () => {
    expect(isLate(order({ status: "shipped", deliveryDate: "2026-07-01" }), NOW)).toBe(false);
    expect(isLate(order({ status: "paid", deliveryDate: "2026-07-01" }), NOW)).toBe(false);
    expect(isLate(order({ status: "production", deliveryDate: undefined }), NOW)).toBe(false);
  });
  it("ignores quotes", () => {
    expect(isLate(order({ kind: "quote", status: "confirmed", deliveryDate: "2026-07-01" }), NOW)).toBe(false);
  });
});
