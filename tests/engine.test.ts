/*
 * Golden-case unit tests for the four domain engines. These engines move
 * unchanged into the production backend, so their outputs are pinned here.
 */

import { describe, expect, it } from "vitest";
import { deriveRailing } from "../lib/engine/geometry";
import { evaluateSia, siaSummary } from "../lib/engine/sia";
import { defaultPriceBook, priceRailing } from "../lib/engine/pricing";
import { buildBom } from "../lib/engine/bom";
import {
  builtinTypes,
  defaultConfig,
  defaultRecipe,
  normalizeForType,
  type RailingConfig,
  type TypeProfile,
  type TypeRecipe,
} from "../lib/engine/types";

const barsType = builtinTypes[0];
const glassType = builtinTypes[1];

const glassConfig = (): RailingConfig => normalizeForType(defaultConfig(), glassType);

describe("geometry engine", () => {
  it("derives the default L-shaped bar railing (3 m + 2 m @ 90°)", () => {
    const d = deriveRailing(defaultConfig(), barsType);
    expect(d.totalLength).toBe(5000);
    expect(d.cornerCount).toBe(1);
    // 3000/1250 → 3 fields (4 posts), 2000/1250 → 2 fields (+2, corner shared)
    expect(d.postCount).toBe(6);
    expect(d.barCount).toBe(40);
    // openings must actually satisfy the requested 110 mm clear
    d.segments.forEach((s) => expect(s.actualBarClear).toBeLessThanOrEqual(110));
  });

  it("tightens post spacing for public usage", () => {
    const d = deriveRailing({ ...defaultConfig(), usage: "public" }, barsType);
    d.segments.forEach((s) => expect(s.postSpacing).toBeLessThanOrEqual(1000));
  });

  it("splits glass into panels of at most 1200 mm", () => {
    const d = deriveRailing(glassConfig(), glassType);
    // 3000 mm → 3 panels, 2000 mm → 2 panels
    expect(d.panelCount).toBe(5);
    d.segments.forEach((s) => s.panels.forEach((p) => expect(p.width).toBeLessThanOrEqual(1200)));
    expect(d.postCount).toBe(0);
  });

  it("respects a custom type's panel width limit", () => {
    const tp: TypeProfile = { ...glassType, id: "ct-x", maxPanelWidth: 800, builtin: false };
    const d = deriveRailing({ ...glassConfig(), typeId: "ct-x" }, tp);
    d.segments.forEach((s) => s.panels.forEach((p) => expect(p.width).toBeLessThanOrEqual(800)));
  });
});

const recipeType = (recipe: TypeRecipe, basePerM = 240): TypeProfile => ({
  id: "ct-recipe",
  template: recipe.infill.kind === "glass" ? "glass" : "bars",
  basePerM,
  barDia: recipe.infill.memberSize,
  maxSlope: recipe.maxSlope,
  maxPanelWidth: recipe.infill.maxPanelWidth,
  active: true,
  builtin: false,
  recipe,
});

describe("recipe engine (type designer)", () => {
  it("derives horizontal rails stacked at ≤ maxOpening", () => {
    const r = defaultRecipe();
    r.infill = { kind: "horizontal_rails", memberSize: 12, maxOpening: 110, maxPanelWidth: 1200 };
    const tp = recipeType(r);
    const cfg = normalizeForType(defaultConfig(), tp);
    const d = deriveRailing(cfg, tp);
    // span = 1000 - 100 - 40 = 860 → ceil((860-110)/122) = 7 members per segment
    expect(d.railCount).toBe(14);
    expect(d.barCount).toBe(0);
    d.segments.forEach((s) => expect(s.actualBarClear).toBeLessThanOrEqual(110));
    // members follow the axis: same start/end heights offset from the base line
    const first = d.segments[0].rails[0];
    expect(first.top.x).toBeCloseTo(3000);
    expect(first.top.y).toBeCloseTo(first.bottom.y);
  });

  it("flags horizontal infill as climbable (fail for public use)", () => {
    const r = defaultRecipe();
    r.infill = { kind: "cables", memberSize: 5, maxOpening: 80, maxPanelWidth: 1200 };
    const tp = recipeType(r);
    const cfg = { ...normalizeForType(defaultConfig(), tp), usage: "public" as const };
    const results = evaluateSia(cfg, deriveRailing(cfg, tp), tp);
    expect(results.find((x) => x.id === "climbHoriz")?.status).toBe("fail");
    const res = { ...cfg, usage: "residential" as const };
    const warn = evaluateSia(res, deriveRailing(res, tp), tp);
    expect(warn.find((x) => x.id === "climbHoriz")?.status).toBe("warn");
  });

  it("respects the recipe's post spacing and profile in geometry + BOM", () => {
    const r = defaultRecipe();
    r.post = { profile: "round", size: 60, maxSpacing: 800 };
    const tp = recipeType(r);
    const cfg = normalizeForType(defaultConfig(), tp);
    const d = deriveRailing(cfg, tp);
    d.segments.forEach((s) => expect(s.postSpacing).toBeLessThanOrEqual(800));
    const bom = buildBom(cfg, d, tp);
    expect(bom.find((l) => l.id === "posts")?.detail).toContain("Ø 60");
  });

  it("derives sheet infill as panels with a sheet cut list", () => {
    const r = defaultRecipe();
    r.infill = { kind: "sheet", memberSize: 3, maxOpening: 110, maxPanelWidth: 900 };
    const tp = recipeType(r);
    const cfg = normalizeForType(defaultConfig(), tp);
    const d = deriveRailing(cfg, tp);
    expect(d.panelCount).toBeGreaterThan(0);
    d.segments.forEach((s) => s.panels.forEach((p) => expect(p.width).toBeLessThanOrEqual(900)));
    const bom = buildBom(cfg, d, tp);
    expect(bom.some((l) => l.id === "sheetPanel" && l.detail.includes("t=3 mm"))).toBe(true);
  });

  it("prices recipe types from their base rate and fixed handrail", () => {
    const r = defaultRecipe();
    r.handrail = { profile: "none", size: 0 };
    const tp = recipeType(r, 300);
    const cfg = normalizeForType(defaultConfig(), tp);
    expect(cfg.handrail).toBe("none");
    const p = priceRailing(cfg, deriveRailing(cfg, tp), defaultPriceBook, tp);
    // 5 m × 300 + corner 35 + setup 120 + shipping 89 = 1744 net
    expect(p.net).toBe(1744);
  });

  it("keeps legacy types byte-identical (no recipe)", () => {
    const cfg = defaultConfig();
    const d = deriveRailing(cfg, builtinTypes[0]);
    expect(d.railCount).toBe(0);
    expect(d.postCount).toBe(6);
    expect(priceRailing(cfg, d, defaultPriceBook, builtinTypes[0]).gross).toBe(1301.52);
  });
});

describe("SIA 358 rules engine", () => {
  it("passes the default configuration", () => {
    const cfg = defaultConfig();
    const results = evaluateSia(cfg, deriveRailing(cfg, barsType), barsType);
    expect(siaSummary(results)).toBe("pass");
  });

  it("fails below 1000 mm guard height", () => {
    const cfg = { ...defaultConfig(), height: 950 };
    const results = evaluateSia(cfg, deriveRailing(cfg, barsType), barsType);
    expect(results.find((r) => r.id === "height")?.status).toBe("fail");
    expect(siaSummary(results)).toBe("fail");
  });

  it("warns at 1000 mm height above 12 m fall height", () => {
    const cfg = { ...defaultConfig(), fallHeightM: 15 };
    const results = evaluateSia(cfg, deriveRailing(cfg, barsType), barsType);
    expect(results.find((r) => r.id === "height12")?.status).toBe("warn");
  });

  it("fails a bottom gap over 120 mm", () => {
    const cfg = { ...defaultConfig(), bottomGap: 150 };
    const results = evaluateSia(cfg, deriveRailing(cfg, barsType), barsType);
    expect(results.find((r) => r.id === "bottomGap")?.status).toBe("fail");
  });

  it("fails stairs on the glass system", () => {
    const cfg = glassConfig();
    cfg.segments[1] = { ...cfg.segments[1], stair: true, slope: 30 };
    const results = evaluateSia(cfg, deriveRailing(cfg, glassType), glassType);
    expect(results.find((r) => r.id === "glassStairs")?.status).toBe("fail");
  });

  it("enforces a custom type's slope limit", () => {
    const tp: TypeProfile = { ...barsType, id: "ct-y", maxSlope: 20, builtin: false };
    const cfg = defaultConfig();
    cfg.segments[1] = { ...cfg.segments[1], stair: true, slope: 30 };
    const results = evaluateSia(cfg, deriveRailing(cfg, tp), tp);
    expect(results.find((r) => r.id === "slope")?.status).toBe("fail");
  });
});

describe("pricing engine", () => {
  it("prices the default bar railing at CHF 1 301.52 gross", () => {
    const cfg = defaultConfig();
    const p = priceRailing(cfg, deriveRailing(cfg, barsType), defaultPriceBook, barsType);
    // 5 m × 192 + corner 35 + setup 120 + shipping 89 = 1204 net, VAT 8.1 %
    expect(p.net).toBe(1204);
    expect(p.gross).toBe(1301.52);
  });

  it("applies the B2B pro discount on goods before shipping and VAT", () => {
    const cfg = defaultConfig();
    const p = priceRailing(cfg, deriveRailing(cfg, barsType), defaultPriceBook, barsType, 0.1);
    const rebate = p.lines.find((l) => l.id === "b2b_discount");
    expect(rebate?.total).toBe(-111.5);
    expect(p.gross).toBe(1180.99);
  });

  it("uses a custom type's base price (CHF 260/m → 1 669.06 gross)", () => {
    const tp: TypeProfile = { ...barsType, id: "ct-z", basePerM: 260, builtin: false };
    const cfg = { ...defaultConfig(), typeId: "ct-z" };
    const p = priceRailing(cfg, deriveRailing(cfg, tp), defaultPriceBook, tp);
    expect(p.gross).toBe(1669.06);
  });

  it("grants free shipping above the threshold", () => {
    const cfg = defaultConfig();
    cfg.segments = [{ ...cfg.segments[0], length: 6000 }, { ...cfg.segments[1], length: 6000 }, { ...cfg.segments[1], id: "s3", length: 6000 }];
    const p = priceRailing(cfg, deriveRailing(cfg, barsType), defaultPriceBook, barsType);
    expect(p.lines.find((l) => l.id === "shipping")?.total).toBe(0);
  });
});

describe("BOM engine", () => {
  it("lists bar-system parts matching the derived geometry", () => {
    const cfg = defaultConfig();
    const d = deriveRailing(cfg, barsType);
    const bom = buildBom(cfg, d, barsType);
    expect(bom.find((l) => l.id === "posts")?.qty).toBe(d.postCount);
    expect(bom.find((l) => l.id === "bars")?.qty).toBe(d.barCount);
    expect(bom.find((l) => l.id === "anchors")?.qty).toBe(d.postCount * 2);
  });

  it("carries a custom bar diameter into the cut list", () => {
    const tp: TypeProfile = { ...barsType, id: "ct-d", barDia: 18, builtin: false };
    const cfg = { ...defaultConfig(), typeId: "ct-d" };
    const bom = buildBom(cfg, deriveRailing(cfg, tp), tp);
    expect(bom.find((l) => l.id === "bars")?.detail).toContain("Ø 18");
  });

  it("groups glass panels into a VSG cut list", () => {
    const cfg = glassConfig();
    const d = deriveRailing(cfg, glassType);
    const bom = buildBom(cfg, d, glassType);
    const panels = bom.filter((l) => l.id === "panels");
    expect(panels.reduce((s, l) => s + l.qty, 0)).toBe(d.panelCount);
    panels.forEach((l) => expect(l.detail).toContain("VSG 2×8"));
  });
});
