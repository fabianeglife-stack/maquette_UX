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
    // as-built recipe: fields of ≤1 m → 3000/1000 = 3 fields (4 posts),
    // 2000/1000 = 2 fields (+2, corner shared)
    expect(d.postCount).toBe(6);
    // 6 flats per field at pitch 144.5 → (3 + 2) × 6
    expect(d.barCount).toBe(30);
    // straight 40 mm flats at pitch 144.5 → 104.5 mm clear ≤ 110 target
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
  it("frames horizontal rails per field, stacked at ≤ maxOpening", () => {
    const r = defaultRecipe();
    r.infill = { kind: "horizontal_rails", memberSize: 12, maxOpening: 110, maxPanelWidth: 1200 };
    const tp = recipeType(r);
    const cfg = normalizeForType(defaultConfig(), tp);
    const d = deriveRailing(cfg, tp);
    // ladder = (1000 - 42) - (100 + 8) = 850 → ceil((850-110)/122) = 7 levels;
    // 3 m → 3 fields, 2 m → 2 fields → 7 × (3 + 2) = 35 cut pieces
    expect(d.railCount).toBe(35);
    expect(d.barCount).toBe(0);
    d.segments.forEach((s) => expect(s.actualBarClear).toBeLessThanOrEqual(110));
    // pieces are level and end at the post faces (post 40 → half 20)
    const first = d.segments[0].rails[0];
    expect(first.bottom.x).toBeCloseTo(20);
    expect(first.top.x).toBeCloseTo(980);
    expect(first.top.y).toBeCloseTo(first.bottom.y);
  });

  it("closes the ladder: the gap under the handrail also respects maxOpening", () => {
    const r = defaultRecipe();
    r.infill = { kind: "horizontal_rails", memberSize: 12, maxOpening: 110, maxPanelWidth: 1200 };
    const tp = recipeType(r);
    const cfg = normalizeForType(defaultConfig(), tp);
    const d = deriveRailing(cfg, tp);
    const seg = d.segments[0];
    const hrUnderside = cfg.height - 42; // round Ø42 handrail
    const topmost = Math.max(...seg.rails.map((x) => x.bottom.y));
    expect(hrUnderside - (topmost + 6)).toBeLessThanOrEqual(110);
    // and the gap above the bottom rail matches the solved opening
    const lowest = Math.min(...seg.rails.map((x) => x.bottom.y));
    expect(lowest - 6 - (cfg.bottomGap + 8)).toBeCloseTo(seg.actualBarClear, 5);
  });

  it("runs cables through posts with tensioners at both segment ends", () => {
    const r = defaultRecipe();
    r.infill = { kind: "cables", memberSize: 5, maxOpening: 80, maxPanelWidth: 1200 };
    r.bottomRail = { profile: "none", size: 0 };
    const tp = recipeType(r);
    const cfg = normalizeForType(defaultConfig(), tp);
    const d = deriveRailing(cfg, tp);
    // ladder = 958 from the floor → ceil((958-80)/85) = 11 cables per segment
    expect(d.railCount).toBe(22);
    d.segments.forEach((s) => {
      expect(s.tensioners.length).toBe(2 * s.rails.length);
      // cables span the whole segment, terminating at the end post faces
      s.rails.forEach((c) => {
        const len = Math.hypot(c.top.x - c.bottom.x, c.top.y - c.bottom.y, c.top.z - c.bottom.z);
        expect(len).toBeCloseTo(s.input.length - 40, 5);
      });
    });
  });

  it("stands stair posts on the treads and stretches them to the raked handrail", () => {
    const r = defaultRecipe();
    r.infill = { kind: "horizontal_rails", memberSize: 12, maxOpening: 110, maxPanelWidth: 1200 };
    const tp = recipeType(r);
    const cfg = normalizeForType(defaultConfig(), tp);
    cfg.segments[1] = { ...cfg.segments[1], stair: true, slope: 30 };
    const d = deriveRailing(cfg, tp);
    const stair = d.segments[1];
    expect(stair.steps).not.toBeNull();
    stair.posts.forEach((p) => {
      const t = Math.hypot(p.base.x - stair.start.x, p.base.z - stair.start.z) / Math.cos((30 * Math.PI) / 180);
      const axisY = stair.start.y + stair.dir.y * t;
      // base sits on (or below) the nosing line, never floating above a tread
      expect(p.base.y).toBeLessThanOrEqual(axisY + 1e-6);
      // post reaches the handrail underside above the axis
      expect(p.top.y - axisY).toBeCloseTo(cfg.height - 42, 5);
      expect(p.top.y - p.base.y).toBeGreaterThanOrEqual(cfg.height - 42 - 1e-6);
    });
    // the corner + slope change produces a handrail joint
    expect(d.joints.length).toBe(1);
  });

  it("derives connection hardware: base plates, joints and BOM lines", () => {
    const r = defaultRecipe();
    r.infill = { kind: "cables", memberSize: 5, maxOpening: 80, maxPanelWidth: 1200 };
    r.bottomRail = { profile: "none", size: 0 };
    const tp = recipeType(r);
    const cfg = normalizeForType(defaultConfig(), tp);
    const d = deriveRailing(cfg, tp);
    const plates = d.segments.reduce((s, x) => s + x.plates.length, 0);
    expect(plates).toBe(d.postCount);
    expect(d.joints.length).toBe(1); // 90° corner elbow
    const bom = buildBom(cfg, d, tp);
    expect(bom.find((l) => l.id === "basePlate")?.qty).toBe(d.postCount);
    expect(bom.find((l) => l.id === "tensioner")?.qty).toBe(d.segments.reduce((s, x) => s + x.tensioners.length, 0));
    expect(bom.find((l) => l.id === "elbow")?.qty).toBe(1);
    expect(bom.find((l) => l.id === "anchors")?.qty).toBe(d.postCount * 4);
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

  it("pins the default type's goldens (as-built straight barreaudage)", () => {
    const cfg = defaultConfig();
    const d = deriveRailing(cfg, builtinTypes[0]);
    expect(d.railCount).toBe(0);
    expect(d.postCount).toBe(6);
    // 5 m × 390 + corner 35 + setup 120 + shipping 89 = 2194 net, VAT 8.1 %
    expect(priceRailing(cfg, d, defaultPriceBook, builtinTypes[0]).gross).toBe(2371.71);
  });
});

describe("as-built straight variant (default type, flats face-on)", () => {
  const straight = builtinTypes[0];
  const moduleCfg = (): RailingConfig => {
    const cfg = normalizeForType(defaultConfig(), straight);
    return { ...cfg, segments: [{ id: "s1", length: 3000, angle: 0, stair: false, slope: 0 }] };
  };

  it("shares the as-built frame defaults and layout with the 45° plan", () => {
    const cfg = moduleCfg();
    expect(cfg.height).toBe(1154);
    expect(cfg.bottomGap).toBe(97);
    const d = deriveRailing(cfg, straight);
    expect(d.postCount).toBe(4);
    expect(d.barCount).toBe(18);
    const xs = d.segments[0].bars.map((b) => b.bottom.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(138.75, 1); // same centred pitch grid as the 45° type
  });

  it("clears 104.5 mm between face-on flats (pitch 144.5 − 40)", () => {
    const cfg = moduleCfg();
    const d = deriveRailing(cfg, straight);
    expect(d.segments[0].actualBarClear).toBeCloseTo(104.5, 5);
    expect(siaSummary(evaluateSia(cfg, d, straight))).toBe("pass");
  });

  it("cuts straight flats without the 45° projection (L 1017)", () => {
    const cfg = moduleCfg();
    const bom = buildBom(cfg, deriveRailing(cfg, straight), straight);
    const flats = bom.find((l) => l.id === "bars")!;
    expect(flats.detail).toBe("40×5 × 1017 mm");
    expect(bom.find((l) => l.id === "posts")?.detail).toContain("60×20×2");
    expect(bom.find((l) => l.id === "basePlate")?.detail).toBe("105×135×10 mm");
  });

  it("allows stairs on the straight variant (raked flats)", () => {
    const cfg = moduleCfg();
    cfg.segments = [
      { id: "s1", length: 3000, angle: 0, stair: false, slope: 0 },
      { id: "s2", length: 2000, angle: 0, stair: true, slope: 30 },
    ];
    const results = evaluateSia(cfg, deriveRailing(cfg, straight), straight);
    expect(results.find((r) => r.id === "slope")?.status).toBe("pass");
  });
});

describe("as-built barreaudage 45° (flat45 vs plan 000001-1-140.000 + STEP)", () => {
  const flat45 = builtinTypes.find((x) => x.id === "flat45")!;
  /** The client's 3.02 m module: post axes 3000 mm apart → one 3 m segment. */
  const moduleCfg = (): RailingConfig => {
    const cfg = normalizeForType(defaultConfig(), flat45);
    return { ...cfg, segments: [{ id: "s1", length: 3000, angle: 0, stair: false, slope: 0 }] };
  };

  it("applies the as-built defaults when the type is selected", () => {
    const cfg = moduleCfg();
    expect(cfg.height).toBe(1154);
    expect(cfg.bottomGap).toBe(97);
  });

  it("reproduces the STEP nomenclature: 4 posts, 18 flats in 3 fields", () => {
    const cfg = moduleCfg();
    const d = deriveRailing(cfg, flat45);
    expect(d.postCount).toBe(4); // 2 end + 2 intermediate (fields of 1 m)
    expect(d.barCount).toBe(18); // 6 × PLAT 40×5 per field
    expect(d.segments[0].postSpacing).toBe(1000);
    // terminal plates flush with the element end (STEP: centres at 40 mm
    // inside the post axes), intermediate plates centred under their posts
    const px = d.segments[0].plates.map((p) => p.at.x).sort((a, b) => a - b);
    expect(px[0]).toBeCloseTo(40, 1);
    expect(px[1]).toBeCloseTo(1000, 5);
    expect(px[2]).toBeCloseTo(2000, 5);
    expect(px[3]).toBeCloseTo(2960, 1);
  });

  it("places the flats at the exact pitch and centred offset of the STEP", () => {
    const d = deriveRailing(moduleCfg(), flat45);
    const xs = d.segments[0].bars.map((b) => b.bottom.x).sort((a, b) => a - b);
    // first flat of field 1: post face 20 + centred offset 128.75 − half post 10 → 138.75
    expect(xs[0]).toBeCloseTo(138.75, 1);
    for (let k = 1; k < 6; k++) expect(xs[k] - xs[k - 1]).toBeCloseTo(144.5, 2);
    // field 2 starts one post spacing later at the same in-field offset
    expect(xs[6]).toBeCloseTo(1138.75, 1);
  });

  it("welds the flats between bottom rail and handrail (jour vertical 1017)", () => {
    const d = deriveRailing(moduleCfg(), flat45);
    const bar = d.segments[0].bars[0];
    expect(bar.bottom.y).toBeCloseTo(117); // bottom rail top edge: 97 + 20
    expect(bar.top.y).toBeCloseTo(1134); // handrail underside: 1154 − 20
  });

  it("keeps the 45° clear opening at 112.7 mm ≤ 120 (SIA sphere rule)", () => {
    const cfg = moduleCfg();
    const d = deriveRailing(cfg, flat45);
    expect(d.segments[0].actualBarClear).toBeCloseTo(112.68, 1);
    const results = evaluateSia(cfg, d, flat45);
    expect(results.find((r) => r.id === "openings")?.status).toBe("pass");
    expect(siaSummary(results)).toBe("pass");
  });

  it("matches the plan cartouche in the BOM (tubes 60×20×2, flats 40×5 L1045, plates 105×135×10)", () => {
    const cfg = moduleCfg();
    const d = deriveRailing(cfg, flat45);
    const bom = buildBom(cfg, d, flat45);
    expect(bom.find((l) => l.id === "posts")?.detail).toContain("60×20×2");
    const flats = bom.find((l) => l.id === "bars")!;
    expect(flats.qty).toBe(18);
    expect(flats.detail).toContain("40×5 × 1045 mm");
    expect(bom.find((l) => l.id === "handrailPart")?.detail).toBe("60×20×2 mm");
    expect(bom.find((l) => l.id === "bottomRail")?.detail).toBe("60×20×2 mm");
    const plates = bom.find((l) => l.id === "basePlate")!;
    expect(plates.qty).toBe(4);
    expect(plates.detail).toBe("105×135×10 mm");
    expect(bom.find((l) => l.id === "anchors")?.qty).toBe(8); // 2 per plate
  });

  it("excludes stairs for this type (maxSlope 0)", () => {
    const cfg = moduleCfg();
    cfg.segments = [{ ...cfg.segments[0], stair: true, slope: 30 }];
    const results = evaluateSia(cfg, deriveRailing(cfg, flat45), flat45);
    expect(results.find((r) => r.id === "glassStairs")?.status).toBe("fail");
  });
});

describe("situation parameters (walls, substrate, finish)", () => {
  it("deducts the 5 cm wall clearance from connected ends", () => {
    const cfg = { ...defaultConfig(), walls: "start" as const };
    expect(deriveRailing(cfg, barsType).totalLength).toBe(4950);
    const both = { ...defaultConfig(), walls: "both" as const };
    expect(deriveRailing(both, barsType).totalLength).toBe(4900);
    expect(deriveRailing(defaultConfig(), barsType).totalLength).toBe(5000);
  });

  it("prices galvanized-only as a deduction and skips the colour surcharge", () => {
    const cfg = { ...defaultConfig(), finish: "galvanized" as const, color: "custom" as const };
    const p = priceRailing(cfg, deriveRailing(cfg, barsType), defaultPriceBook, barsType);
    expect(p.lines.find((l) => l.id === "finish_galvanized")?.total).toBeLessThan(0);
    expect(p.lines.find((l) => l.id === "color_custom")).toBeUndefined();
  });

  it("prices substrate surcharges and adapts the anchor spec", () => {
    const cfg = { ...defaultConfig(), substrate: "stone_top" as const };
    const d = deriveRailing(cfg, barsType);
    const p = priceRailing(cfg, d, defaultPriceBook, barsType);
    expect(p.lines.some((l) => l.id === "substrate_stone_top")).toBe(true);
    expect(buildBom(cfg, d, barsType).find((l) => l.id === "anchors")?.detail).toContain("Verbund");
    const wood = { ...defaultConfig(), substrate: "wood_side" as const, mounting: "side" as const };
    expect(buildBom(wood, deriveRailing(wood, barsType), barsType).find((l) => l.id === "anchors")?.detail).toContain("10×140");
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

describe("SIA 358 — failing paths & warnings (regression guards)", () => {
  it("flags the guard as mandatory at/above 1 m fall height, optional below", () => {
    const high = evaluateSia(defaultConfig(), deriveRailing(defaultConfig(), barsType), barsType);
    expect(high.find((r) => r.id === "guardRequired")?.status).toBe("pass");
    const lowCfg = { ...defaultConfig(), fallHeightM: 0.5 };
    const low = evaluateSia(lowCfg, deriveRailing(lowCfg, barsType), barsType);
    expect(low.find((r) => r.id === "guardOptional")?.status).toBe("warn");
    expect(low.find((r) => r.id === "guardRequired")).toBeUndefined();
  });

  it("fails openings when the clear gap exceeds the Ø120 mm sphere", () => {
    // Legacy bar fill with an intentionally wide target opening.
    const tp: TypeProfile = { ...barsType, id: "ct-open", barDia: 12, builtin: false, recipe: undefined };
    const cfg = { ...defaultConfig(), typeId: "ct-open", barClear: 300 };
    const d = deriveRailing(cfg, tp);
    expect(Math.max(...d.segments.map((s) => s.actualBarClear))).toBeGreaterThan(120);
    expect(evaluateSia(cfg, d, tp).find((r) => r.id === "openings")?.status).toBe("fail");
  });

  it("fails loads when post spacing exceeds the SIA 261 limit", () => {
    // Geometry itself caps spacing at MAX_POST_SPACING, so the rule is exercised
    // by pinning an over-wide spacing on the derived model directly.
    const cfg = defaultConfig();
    const d = deriveRailing(cfg, barsType);
    d.segments.forEach((s) => (s.postSpacing = 1500)); // > residential 1250
    expect(evaluateSia(cfg, d, barsType).find((x) => x.id === "loads")?.status).toBe("fail");
  });

  it("warns on transport when a segment exceeds the kit length, and summarises as warn", () => {
    const cfg = { ...defaultConfig(), segments: [{ id: "s1", length: 6500, angle: 0, stair: false, slope: 0 }] };
    const results = evaluateSia(cfg, deriveRailing(cfg, barsType), barsType);
    expect(results.find((r) => r.id === "transport")?.status).toBe("warn");
    expect(siaSummary(results)).toBe("warn");
  });
});

describe("geometry — weight model (feeds shipping) is pinned", () => {
  it("pins the default kit weight for the bar and glass systems", () => {
    expect(deriveRailing(defaultConfig(), barsType).weightKg).toBe(79);
    expect(deriveRailing(glassConfig(), glassType).weightKg).toBe(232);
  });

  it("never emits negative dimensions for a degenerate short segment", () => {
    const cfg = { ...defaultConfig(), segments: [{ id: "s1", length: 250, angle: 0, stair: false, slope: 0 }] };
    const d = deriveRailing(cfg, glassType);
    d.segments.forEach((s) => {
      expect(s.actualBarClear).toBeGreaterThanOrEqual(0);
      s.panels.forEach((p) => expect(p.width).toBeGreaterThanOrEqual(0));
    });
  });
});

describe("pricing engine", () => {
  it("prices the default railing at CHF 2 371.71 gross (390/m as-built type)", () => {
    const cfg = defaultConfig();
    const p = priceRailing(cfg, deriveRailing(cfg, barsType), defaultPriceBook, barsType);
    // 5 m × 390 + corner 35 + setup 120 + shipping 89 = 2194 net, VAT 8.1 %
    expect(p.net).toBe(2194);
    expect(p.gross).toBe(2371.71);
  });

  it("applies the B2B pro discount on goods before shipping and VAT", () => {
    const cfg = defaultConfig();
    const p = priceRailing(cfg, deriveRailing(cfg, barsType), defaultPriceBook, barsType, 0.1);
    const rebate = p.lines.find((l) => l.id === "b2b_discount");
    expect(rebate?.total).toBe(-210.5);
    expect(p.gross).toBe(2144.16);
  });

  it("uses a custom type's base price (CHF 260/m → 1 669.06 gross)", () => {
    const tp: TypeProfile = { ...barsType, id: "ct-z", basePerM: 260, builtin: false };
    const cfg = { ...defaultConfig(), typeId: "ct-z" };
    const p = priceRailing(cfg, deriveRailing(cfg, tp), defaultPriceBook, tp);
    expect(p.gross).toBe(1669.06);
  });

  it("clamps an out-of-range discount rate to [0,1]", () => {
    const cfg = defaultConfig();
    const d = deriveRailing(cfg, barsType);
    // A rate above 1 must not invert or over-credit the total; clamp to full rebate.
    const over = priceRailing(cfg, d, defaultPriceBook, barsType, 5);
    const full = priceRailing(cfg, d, defaultPriceBook, barsType, 1);
    expect(over.gross).toBe(full.gross);
    // A negative rate must behave like no discount.
    const neg = priceRailing(cfg, d, defaultPriceBook, barsType, -0.5);
    const none = priceRailing(cfg, d, defaultPriceBook, barsType, 0);
    expect(neg.gross).toBe(none.gross);
    expect(neg.lines.find((l) => l.id === "b2b_discount")).toBeUndefined();
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

  it("carries a custom bar diameter into the cut list (legacy template type)", () => {
    const tp: TypeProfile = { ...barsType, id: "ct-d", barDia: 18, builtin: false, recipe: undefined };
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
