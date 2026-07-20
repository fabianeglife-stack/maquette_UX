/*
 * Unit tests for the procurement engine: nesting cut pieces into 6 m stock
 * bars, the material order derived from a configuration, and the treatment
 * order (galvanizing vs duplex powder coating).
 */

import { describe, expect, it } from "vitest";
import { deriveRailing } from "../lib/engine/geometry";
import { builtinTypes, defaultConfig } from "../lib/engine/types";
import { drillStationsFor, kgPerM, materialOrderFor, nestPieces, treatmentOrderFor } from "../lib/engine/procurement";

const barsType = builtinTypes[0];

describe("nestPieces", () => {
  it("packs pieces into as few stock bars as first-fit-decreasing allows", () => {
    // 4 × 2900 mm: two per 6 m bar (2×(2900+5 kerf) = 5810 ≤ 6000).
    expect(nestPieces([2900, 2900, 2900, 2900]).bars).toBe(2);
    // 3 × 1900 mm share one bar (5715); the 5900 piece opens its own bar.
    expect(nestPieces([1900, 1900, 1900, 5900]).bars).toBe(2);
  });

  it("reports utilization as used length over purchased stock", () => {
    const { bars, utilization } = nestPieces([2995, 2995]);
    expect(bars).toBe(1);
    expect(utilization).toBeGreaterThan(0.99);
    expect(utilization).toBeLessThanOrEqual(1);
  });

  it("handles over-length runs and the empty list", () => {
    expect(nestPieces([13000]).bars).toBe(3); // 2 full bars + remainder
    expect(nestPieces([]).bars).toBe(0);
  });
});

describe("kgPerM", () => {
  it("weighs flats, tubes and solid rounds plausibly", () => {
    expect(kgPerM("flat", 60, 8)).toBeCloseTo(3.77, 1); // 60×8 flat
    expect(kgPerM("rect", 20, 60, 2)).toBeCloseTo(2.51, 1); // 60×20×2 tube
    expect(kgPerM("round", 12)).toBeCloseTo(0.89, 1); // Ø12 solid
    expect(kgPerM("none", 42)).toBe(0);
  });
});

describe("materialOrderFor", () => {
  const cfg = defaultConfig();
  const derived = deriveRailing(cfg, barsType);
  const order = materialOrderFor(cfg, derived, barsType);

  it("lists posts, infill flats and both rails with stock bars and weight", () => {
    const ids = order.lines.map((l) => l.id);
    expect(ids).toContain("posts");
    expect(ids).toContain("bars");
    expect(ids).toContain("handrailPart");
    expect(ids).toContain("bottomRail");
    for (const l of order.lines) {
      expect(l.pieces.length).toBeGreaterThan(0);
      expect(l.stockBars).toBeGreaterThan(0);
      expect(l.utilization).toBeGreaterThan(0);
      expect(l.utilization).toBeLessThanOrEqual(1);
    }
    expect(order.totalBars).toBe(order.lines.reduce((s, l) => s + l.stockBars, 0));
    expect(order.totalWeightKg).toBeGreaterThan(0);
  });

  it("keeps piece lengths consistent with the geometry", () => {
    const posts = order.lines.find((l) => l.id === "posts")!;
    expect(posts.pieces.length).toBe(derived.postCount);
    // Default config is flat ground: every post ≈ configured height.
    for (const p of posts.pieces) expect(p).toBeGreaterThanOrEqual(cfg.height - 60);
    const flats = order.lines.find((l) => l.id === "bars")!;
    expect(flats.pieces.length).toBe(derived.barCount);
  });

  it("puts glass panels in trade lines, not nested stock", () => {
    const glassType = builtinTypes.find((t) => t.template === "glass")!;
    const gcfg = { ...defaultConfig(), system: "glass" as const, typeId: glassType.id };
    const gDerived = deriveRailing(gcfg, glassType);
    const gOrder = materialOrderFor(gcfg, gDerived, glassType);
    expect(gOrder.trade.some((t) => t.id === "panels")).toBe(true);
    expect(gOrder.lines.every((l) => l.id !== "panels")).toBe(true);
  });
});

describe("treatmentOrderFor", () => {
  const cfg = defaultConfig();
  const derived = deriveRailing(cfg, barsType);

  it("orders duplex galvanizing + powder coating for a coated railing", () => {
    const t = treatmentOrderFor({ ...cfg, finish: "coated", color: "ral7016" }, derived);
    expect(t.process).toBe("duplex");
    expect(t.ral).toBe("ral7016");
    expect(t.totalWeightKg).toBe(derived.weightKg);
    expect(t.parts.reduce((s, p) => s + p.qty, 0)).toBe(derived.segments.length);
    expect(t.maxPieceLengthMm).toBeGreaterThan(0);
  });

  it("orders plain hot-dip galvanizing when the finish is galvanized", () => {
    const t = treatmentOrderFor({ ...cfg, finish: "galvanized" }, derived);
    expect(t.process).toBe("galvanizing");
    expect(t.ral).toBeUndefined();
  });
});

describe("drillStationsFor", () => {
  const cfg = defaultConfig();
  const derived = deriveRailing(cfg, barsType);

  it("emits one hole station per bar on both rails, centred on the run", () => {
    const d = drillStationsFor(cfg, derived, barsType);
    expect(d.handrailPart).toBeDefined();
    expect(d.bottomRail).toBeDefined();
    // One piece per segment; stations per piece = that segment's bar count.
    const totalHandrail = d.handrailPart!.reduce((s, a) => s + a.length, 0);
    expect(totalHandrail).toBe(derived.barCount);
    expect(d.bottomRail!.reduce((s, a) => s + a.length, 0)).toBe(derived.barCount);
    // Stations are symmetric about the piece centre (0) and within the run.
    for (let i = 0; i < derived.segments.length; i++) {
      const st = d.handrailPart![i];
      const run = derived.segments[i].input.length;
      for (const z of st) expect(Math.abs(z)).toBeLessThan(run / 2);
      const sum = st.reduce((s, z) => s + z, 0);
      expect(Math.abs(sum)).toBeLessThan(1); // centred
    }
  });

  it("is empty for infills without through-mounted bars (glass)", () => {
    const glassType = builtinTypes.find((t) => t.template === "glass")!;
    const gcfg = { ...defaultConfig(), system: "glass" as const, typeId: glassType.id };
    const gDerived = deriveRailing(gcfg, glassType);
    expect(drillStationsFor(gcfg, gDerived, glassType)).toEqual({});
  });
});
