/*
 * Procurement engine: turns a configuration into the two supplier orders that
 * precede fabrication — the material order (steel sections nested into stock
 * bars, the way steel-fabrication MRP modules do) and the surface-treatment
 * order (hot-dip galvanizing per ISO 1461, or duplex galvanizing + powder
 * coating in the configured RAL). Pure module — no DOM, unit-testable.
 */

import { railDepth, type DerivedRailing } from "./geometry";
import type { RailingConfig, TypeProfile } from "./types";

/** Commercial stock-bar length for steel sections (mm). */
export const STOCK_BAR_MM = 6000;
/** Saw kerf + clamping allowance consumed by each cut (mm). */
export const KERF_MM = 5;

export interface MaterialLine {
  /** Part id — labelled via the existing admin.bom.parts dictionary. */
  id: string;
  /** Section designation (dimensions only), e.g. "60×20×2 mm", "Ø 12 mm". */
  designation: string;
  /** Individual cut lengths (mm), longest first. */
  pieces: number[];
  /** Stock bars (6 m) to order after first-fit-decreasing nesting. */
  stockBars: number;
  /** Share of the purchased stock actually used (0..1). */
  utilization: number;
  /** Approximate steel weight of the pieces (kg). */
  weightKg: number;
}

/** Bought-in items that are ordered per piece, not nested (glass, sheet, cable). */
export interface TradeLine {
  id: string;
  designation: string;
  qty: number;
  unit: "pc" | "m";
}

export interface MaterialOrder {
  lines: MaterialLine[];
  trade: TradeLine[];
  totalBars: number;
  totalWeightKg: number;
}

export interface TreatmentOrder {
  /** galvanizing = hot-dip only; duplex = galvanizing + powder coating. */
  process: "galvanizing" | "duplex";
  /** RAL colour key (cfg.color) when powder coating applies. */
  ral?: RailingConfig["color"];
  /** Welded field elements to treat, grouped by rounded length. */
  parts: { designation: string; qty: number }[];
  /** Invoicing basis for the galvanizer (kg, whole railing). */
  totalWeightKg: number;
  /** Longest element (mm) — must fit the zinc bath / oven. */
  maxPieceLengthMm: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * First-fit-decreasing nesting of cut pieces into stock bars. Pieces longer
 * than a stock bar consume whole bars (welded joint on site/shop).
 */
export function nestPieces(pieces: number[], stock: number = STOCK_BAR_MM): { bars: number; utilization: number } {
  if (pieces.length === 0) return { bars: 0, utilization: 0 };
  const sorted = [...pieces].sort((a, b) => b - a);
  const remaining: number[] = []; // free capacity per opened bar
  let fullBars = 0;
  for (const p of sorted) {
    if (p >= stock) {
      fullBars += Math.ceil(p / stock);
      continue;
    }
    const need = p + KERF_MM;
    const i = remaining.findIndex((c) => c >= need);
    if (i >= 0) remaining[i] -= need;
    else remaining.push(stock - need);
  }
  const bars = fullBars + remaining.length;
  const used = sorted.reduce((s, x) => s + x, 0);
  return { bars, utilization: bars > 0 ? r2(used / (bars * stock)) : 0 };
}

/** Approximate running weight (kg/m) of a steel section. */
export function kgPerM(profile: "round" | "flat" | "rect" | "square" | "none", size: number, depth?: number, wall?: number): number {
  const RHO = 0.00785; // kg per mm²·m of steel
  switch (profile) {
    case "flat":
      return r2(size * (depth ?? 8) * RHO);
    case "rect":
      return wall ? r2(2 * ((depth ?? size) + size) * wall * RHO) : r2((depth ?? size) * size * RHO);
    case "square":
      return wall ? r2(4 * size * wall * RHO) : r2(4.4 * (size / 40));
    case "round":
      return wall ? r2(Math.PI * size * wall * RHO) : r2(size * size * 0.0062);
    default:
      return 0;
  }
}

const pieceLen = (x: { bottom: { x: number; y: number; z: number }; top: { x: number; y: number; z: number } }) =>
  Math.hypot(x.top.x - x.bottom.x, x.top.y - x.bottom.y, x.top.z - x.bottom.z);

/** Sloped run length of a segment (mm) — rails/handrail follow the stair. */
const slopedLen = (length: number, slopeDeg: number) => length / Math.cos((slopeDeg * Math.PI) / 180);

function line(id: string, designation: string, kgm: number, pieces: number[]): MaterialLine {
  const rounded = pieces.map((p) => Math.round(p)).sort((a, b) => b - a);
  const { bars, utilization } = nestPieces(rounded);
  const weightKg = r1((rounded.reduce((s, x) => s + x, 0) / 1000) * kgm);
  return { id, designation, pieces: rounded, stockBars: bars, utilization, weightKg };
}

/** The steel/material purchase order derived from the configuration. */
export function materialOrderFor(cfg: RailingConfig, derived: DerivedRailing, tp?: TypeProfile): MaterialOrder {
  const lines: MaterialLine[] = [];
  const trade: TradeLine[] = [];
  const recipe = tp?.recipe;
  const runsM = derived.segments.map((s) => slopedLen(s.input.length, s.slopeDeg));

  if (recipe) {
    const inf = recipe.infill;
    const hrDepth = railDepth(recipe.handrail.profile, recipe.handrail.size);
    const brDepth = railDepth(recipe.bottomRail.profile, recipe.bottomRail.size);

    if (recipe.post.profile !== "none") {
      const p = recipe.post;
      const pieces = derived.segments.flatMap((s) => s.posts.map((po) => po.top.y - po.base.y));
      const designation =
        p.profile === "round"
          ? `Ø ${p.size}${p.wall ? `×${p.wall}` : ""} mm`
          : p.profile === "rect"
            ? `${p.depth ?? p.size}×${p.size}${p.wall ? `×${p.wall}` : ""} mm`
            : `${p.size}×${p.size}${p.wall ? `×${p.wall}` : ""} mm`;
      lines.push(line("posts", designation, kgPerM(p.profile === "rect" ? "rect" : p.profile === "round" ? "round" : "square", p.size, p.depth, p.wall), pieces));
    }

    if (inf.kind === "vertical_bars") {
      const barLen = cfg.height - (hrDepth > 0 ? hrDepth : 40) - cfg.bottomGap - brDepth;
      lines.push(line("bars", `Ø ${inf.memberSize} mm`, kgPerM("round", inf.memberSize), Array(derived.barCount).fill(barLen)));
    } else if (inf.kind === "vertical_flats") {
      const flatW = inf.flatW ?? 40;
      const flatT = inf.flatT ?? inf.memberSize;
      const angle = inf.angleDeg ?? 45;
      const weldH = cfg.height - (hrDepth > 0 ? hrDepth : 40) - cfg.bottomGap - brDepth;
      const barLen = Math.round(weldH + flatW * Math.sin((angle * Math.PI) / 180));
      lines.push(line("bars", `${flatW}×${flatT} mm`, kgPerM("flat", flatW, flatT), Array(derived.barCount).fill(barLen)));
    } else if (inf.kind === "horizontal_rails") {
      const pieces = derived.segments.flatMap((s) => s.rails.map(pieceLen));
      lines.push(line("railsPart", `Ø ${inf.memberSize} mm`, kgPerM("round", inf.memberSize), pieces));
    } else if (inf.kind === "cables") {
      const cableM = r1(derived.segments.reduce((s, x) => s + x.rails.reduce((a, r) => a + pieceLen(r) / 1000, 0), 0));
      trade.push({ id: "cables", designation: `Ø ${inf.memberSize} mm`, qty: cableM, unit: "m" });
    } else {
      // glass / sheet panels: bought per piece from the glazier/sheet supplier
      const groups = new Map<number, number>();
      derived.segments.forEach((s) => s.panels.forEach((p) => groups.set(Math.round(p.width), (groups.get(Math.round(p.width)) ?? 0) + 1)));
      const panelH = cfg.height - cfg.bottomGap - hrDepth;
      const spec = inf.kind === "glass" ? (recipe.handrail.profile === "none" ? "VSG 2×10" : "VSG 2×8") : `t=${inf.memberSize} mm`;
      [...groups.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([w, n]) => trade.push({ id: inf.kind === "glass" ? "panels" : "sheetPanel", designation: `${spec} · ${w} × ${panelH} mm`, qty: n, unit: "pc" }));
    }

    const railSpec = (r: { profile: string; size: number; depth?: number; wall?: number }) =>
      r.profile === "flat" ? `${r.size}×8 mm` : r.profile === "rect" ? `${r.depth ?? r.size}×${r.size}${r.wall ? `×${r.wall}` : ""} mm` : `Ø ${r.size} mm`;
    if (recipe.handrail.profile !== "none") {
      lines.push(line("handrailPart", railSpec(recipe.handrail), kgPerM(recipe.handrail.profile as "round" | "flat" | "rect", recipe.handrail.size, recipe.handrail.depth, recipe.handrail.wall), runsM));
    }
    if (recipe.bottomRail.profile !== "none") {
      lines.push(line("bottomRail", railSpec(recipe.bottomRail), kgPerM(recipe.bottomRail.profile as "round" | "flat" | "rect", recipe.bottomRail.size, recipe.bottomRail.depth, recipe.bottomRail.wall), runsM));
    }
    if (recipe.post.profile === "none") {
      lines.push(line("baseProfile", cfg.mounting === "side" ? "seitlich / lateral" : "aufgesetzt / top", 6, runsM));
    }
  } else if (cfg.system === "bars") {
    const barDia = tp?.barDia ?? 12;
    lines.push(line("posts", "40×40 mm", kgPerM("square", 40), Array(derived.postCount).fill(cfg.height)));
    lines.push(line("bars", `Ø ${barDia} mm`, kgPerM("round", barDia), Array(derived.barCount).fill(cfg.height - cfg.bottomGap - 40)));
    lines.push(line("handrailPart", cfg.handrail === "flat_steel" ? "60×8 mm" : "Ø 42 mm", 2.5, runsM));
    lines.push(line("bottomRail", "30×8 mm", kgPerM("flat", 30), runsM));
  } else {
    const groups = new Map<number, number>();
    derived.segments.forEach((s) => s.panels.forEach((p) => groups.set(Math.round(p.width), (groups.get(Math.round(p.width)) ?? 0) + 1)));
    const panelH = cfg.height - cfg.bottomGap - (cfg.handrail === "none" ? 0 : 40);
    const glassSpec = cfg.handrail === "none" ? "VSG 2×10" : "VSG 2×8";
    [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([w, n]) => trade.push({ id: "panels", designation: `${glassSpec} · ${w} × ${panelH} mm`, qty: n, unit: "pc" }));
    lines.push(line("baseProfile", cfg.mounting === "side" ? "seitlich / lateral" : "aufgesetzt / top", 6, runsM));
    if (cfg.handrail !== "none") lines.push(line("handrailPart", "Ø 42 mm inox", 2.5, runsM));
  }

  return {
    lines,
    trade,
    totalBars: lines.reduce((s, l) => s + l.stockBars, 0),
    totalWeightKg: r1(lines.reduce((s, l) => s + l.weightKg, 0)),
  };
}

/** Hole stations (mm along the tube axis, from the piece centre) for the drilled
 *  rails: one hole per infill bar at its position along the run, mirrored on the
 *  handrail and the bottom rail (each bar is seated/welded into a hole in both).
 *  Empty for infills without through-mounted bars (horizontal rails, cables,
 *  glass/sheet). Piece order mirrors `materialOrderFor` — one handrail/bottom-rail
 *  piece per segment. */
export interface DrillStations {
  handrailPart?: number[][];
  bottomRail?: number[][];
}

export function drillStationsFor(cfg: RailingConfig, derived: DerivedRailing, tp?: TypeProfile): DrillStations {
  const recipe = tp?.recipe;
  if (!recipe) return {};
  const kind = recipe.infill.kind;
  if (kind !== "vertical_bars" && kind !== "vertical_flats") return {};
  const perSegment = derived.segments.map((s) => {
    const run = slopedLen(s.input.length, s.slopeDeg);
    return s.bars.map((b) => {
      // Distance of the bar along the (possibly sloped) run axis, centred.
      const t = (b.top.x - s.start.x) * s.dir.x + (b.top.y - s.start.y) * s.dir.y + (b.top.z - s.start.z) * s.dir.z;
      return r2(t - run / 2);
    });
  });
  const out: DrillStations = {};
  if (recipe.handrail.profile !== "none") out.handrailPart = perSegment;
  if (recipe.bottomRail.profile !== "none") out.bottomRail = perSegment.map((a) => [...a]);
  return out;
}

/** The surface-treatment order: the welded field elements after fabrication. */
export function treatmentOrderFor(cfg: RailingConfig, derived: DerivedRailing): TreatmentOrder {
  // Treated as welded assemblies, one element per field/segment.
  const groups = new Map<number, number>();
  let maxLen = 0;
  derived.segments.forEach((s) => {
    const l = Math.round(slopedLen(s.input.length, s.slopeDeg) / 10) * 10;
    maxLen = Math.max(maxLen, l);
    groups.set(l, (groups.get(l) ?? 0) + 1);
  });
  const parts = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([l, n]) => ({ designation: `${l} × ${cfg.height} mm`, qty: n }));
  return {
    process: cfg.finish === "galvanized" ? "galvanizing" : "duplex",
    ral: cfg.finish === "galvanized" ? undefined : cfg.color,
    parts,
    totalWeightKg: derived.weightKg,
    maxPieceLengthMm: maxLen,
  };
}
