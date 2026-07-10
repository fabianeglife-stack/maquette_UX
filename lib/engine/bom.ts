/*
 * Bill of materials: derives the production parts list from a configuration.
 * Labels are i18n keys resolved by the UI.
 */

import { railDepth, type DerivedRailing } from "./geometry";
import { PANEL_GAP, type RailingConfig, type TypeProfile } from "./types";

export interface BomLine {
  id: string;
  qty: number;
  unit: "pc" | "m" | "set";
  detail: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Anchor spec depends on the substrate (wood screws, composite anchors in stone). */
function anchorSpec(cfg: RailingConfig): string {
  switch (cfg.substrate) {
    case "wood_side":
      return "10×140 mm";
    case "stone_top":
      return "M12 Verbund / scellement";
    default:
      return "M12";
  }
}

export function buildBom(cfg: RailingConfig, derived: DerivedRailing, tp?: TypeProfile): BomLine[] {
  const lines: BomLine[] = [];
  const m = r1(derived.totalLength / 1000);
  const recipe = tp?.recipe;

  if (recipe) {
    // ---- recipe-driven parts list (type-designer types) ----
    const inf = recipe.infill;
    const hrDepth = railDepth(recipe.handrail.profile, recipe.handrail.size);
    const brDepth = railDepth(recipe.bottomRail.profile, recipe.bottomRail.size);
    const pieceLen = (x: { bottom: { x: number; y: number; z: number }; top: { x: number; y: number; z: number } }) =>
      Math.hypot(x.top.x - x.bottom.x, x.top.y - x.bottom.y, x.top.z - x.bottom.z);
    if (recipe.post.profile !== "none") {
      const p = recipe.post;
      // Cut list grouped by post length (stair posts run longer, down to the tread).
      const groups = new Map<number, number>();
      derived.segments.forEach((s) =>
        s.posts.forEach((po) => {
          const l = Math.round((po.top.y - po.base.y) / 5) * 5;
          groups.set(l, (groups.get(l) ?? 0) + 1);
        }),
      );
      const postSpec =
        p.profile === "round"
          ? (l: number) => `Ø ${p.size} × ${l} mm`
          : p.profile === "rect"
            ? (l: number) => `${p.depth ?? p.size}×${p.size}${p.wall ? `×${p.wall}` : ""} × ${l} mm`
            : (l: number) => `${p.size}×${p.size}×${l} mm`;
      [...groups.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([l, n]) =>
          lines.push({
            id: "posts",
            qty: n,
            unit: "pc",
            detail: postSpec(l),
          }),
        );
    }
    if (inf.kind === "vertical_bars") {
      const barLen = cfg.height - (hrDepth > 0 ? hrDepth : 40) - cfg.bottomGap - brDepth;
      lines.push({ id: "bars", qty: derived.barCount, unit: "pc", detail: `Ø ${inf.memberSize} × ${barLen} mm` });
    } else if (inf.kind === "vertical_flats") {
      // Flats: cut length = weld-to-weld height + the rotated width's
      // projection (cartouche: 1045 for the 45° plan, straight = 1017).
      const flatW = inf.flatW ?? 40;
      const flatT = inf.flatT ?? inf.memberSize;
      const angle = inf.angleDeg ?? 45;
      const weldH = cfg.height - (hrDepth > 0 ? hrDepth : 40) - cfg.bottomGap - brDepth;
      const barLen = Math.round(weldH + flatW * Math.sin((angle * Math.PI) / 180));
      lines.push({
        id: "bars",
        qty: derived.barCount,
        unit: "pc",
        detail: `${flatW}×${flatT} × ${barLen} mm${angle > 0 ? ` · ${angle}°` : ""}`,
      });
    } else if (inf.kind === "cables") {
      const cableM = r1(derived.segments.reduce((s, x) => s + x.rails.reduce((a, r) => a + pieceLen(r) / 1000, 0), 0));
      lines.push({ id: "cables", qty: cableM, unit: "m", detail: `Ø ${inf.memberSize} mm` });
    } else if (inf.kind === "horizontal_rails") {
      // Cut list of per-field rail pieces, grouped by length.
      const groups = new Map<number, number>();
      derived.segments.forEach((s) =>
        s.rails.forEach((r) => {
          const l = Math.round(pieceLen(r));
          groups.set(l, (groups.get(l) ?? 0) + 1);
        }),
      );
      [...groups.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([l, n]) =>
          lines.push({ id: "railsPart", qty: n, unit: "pc", detail: `Ø ${inf.memberSize} × ${l} mm` }),
        );
    } else {
      // glass / sheet cut list, grouped by rounded width
      const groups = new Map<number, number>();
      derived.segments.forEach((s) =>
        s.panels.forEach((p) => groups.set(Math.round(p.width), (groups.get(Math.round(p.width)) ?? 0) + 1)),
      );
      const panelH = cfg.height - cfg.bottomGap - hrDepth;
      const spec = inf.kind === "glass" ? (recipe.handrail.profile === "none" ? "VSG 2×10" : "VSG 2×8") : `t=${inf.memberSize} mm`;
      [...groups.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([w, n]) =>
          lines.push({ id: inf.kind === "glass" ? "panels" : "sheetPanel", qty: n, unit: "pc", detail: `${spec} · ${w} × ${panelH} mm` }),
        );
      if (inf.kind === "glass") lines.push({ id: "gaskets", qty: derived.panelCount, unit: "set", detail: `${PANEL_GAP} mm` });
    }
    const railSpec = (r: { profile: string; size: number; depth?: number; wall?: number }) =>
      r.profile === "flat"
        ? `${r.size}×8 mm`
        : r.profile === "rect"
          ? `${r.depth ?? r.size}×${r.size}${r.wall ? `×${r.wall}` : ""} mm`
          : `Ø ${r.size} mm`;
    if (recipe.handrail.profile !== "none") {
      lines.push({ id: "handrailPart", qty: m, unit: "m", detail: railSpec(recipe.handrail) });
    }
    if (recipe.bottomRail.profile !== "none") {
      lines.push({ id: "bottomRail", qty: m, unit: "m", detail: railSpec(recipe.bottomRail) });
    }
    // ---- connection hardware derived from the assembly ----
    const plateCount = derived.segments.reduce((s, x) => s + x.plates.length, 0);
    const tensionerCount = derived.segments.reduce((s, x) => s + x.tensioners.length, 0);
    const capCount = derived.segments.reduce((s, x) => s + x.caps.length, 0);
    const clampCount = derived.segments.reduce((s, x) => s + x.clamps.length, 0);
    if (recipe.post.profile !== "none") {
      if (recipe.plate) {
        // As-built fixing detail: real plate dims, two anchors per plate.
        const pl = recipe.plate;
        lines.push({ id: "basePlate", qty: plateCount, unit: "pc", detail: `${pl.w}×${pl.l}×${pl.t} mm` });
        lines.push({ id: "anchors", qty: plateCount * 2, unit: "pc", detail: anchorSpec(cfg) });
      } else {
        const plateSize = Math.max(100, Math.round(recipe.post.size * 2.2 / 10) * 10);
        lines.push({ id: "basePlate", qty: plateCount, unit: "pc", detail: `${plateSize}×${plateSize}×8 mm` });
        lines.push({ id: "anchors", qty: plateCount * (cfg.mounting === "side" ? 3 : 4), unit: "pc", detail: anchorSpec(cfg) });
      }
    } else {
      lines.push({ id: "baseProfile", qty: m, unit: "m", detail: cfg.mounting === "side" ? "seitlich / lateral" : "aufgesetzt / top" });
      lines.push({ id: "anchors", qty: Math.ceil(derived.totalLength / 300), unit: "pc", detail: anchorSpec(cfg) + ", e=300 mm" });
    }
    if (tensionerCount > 0) lines.push({ id: "tensioner", qty: tensionerCount, unit: "pc", detail: "M8 inox" });
    if (capCount > 0) lines.push({ id: "postCap", qty: capCount, unit: "pc", detail: recipe.post.profile === "round" ? `Ø ${recipe.post.size} mm` : `${recipe.post.size}×${recipe.post.size} mm` });
    if (derived.joints.length > 0) lines.push({ id: "elbow", qty: derived.joints.length, unit: "pc", detail: recipe.handrail.profile === "flat" ? `${recipe.handrail.size}×8 mm` : `Ø ${recipe.handrail.size} mm` });
    if (clampCount > 0) lines.push({ id: "clamp", qty: clampCount, unit: "pc", detail: "Inox" });
    lines.push({ id: "fixings", qty: 1, unit: "set", detail: "" });
    return lines;
  }

  if (cfg.system === "bars") {
    const barDia = tp?.barDia ?? 12;
    lines.push({ id: "posts", qty: derived.postCount, unit: "pc", detail: `40×40×${cfg.height} mm` });
    lines.push({
      id: "bars",
      qty: derived.barCount,
      unit: "pc",
      detail: `Ø ${barDia} × ${cfg.height - cfg.bottomGap - 40} mm`,
    });
    lines.push({ id: "handrailPart", qty: m, unit: "m", detail: cfg.handrail === "flat_steel" ? "60×8 mm" : "Ø 42 mm" });
    lines.push({ id: "bottomRail", qty: m, unit: "m", detail: "30×8 mm" });
    lines.push({ id: "anchors", qty: derived.postCount * (cfg.mounting === "side" ? 3 : 2), unit: "pc", detail: anchorSpec(cfg) });
  } else {
    // Group panels by rounded width for the cut list.
    const groups = new Map<number, number>();
    derived.segments.forEach((s) =>
      s.panels.forEach((p) => {
        const w = Math.round(p.width);
        groups.set(w, (groups.get(w) ?? 0) + 1);
      }),
    );
    const panelH = cfg.height - cfg.bottomGap - (cfg.handrail === "none" ? 0 : 40);
    const glassSpec = cfg.handrail === "none" ? "VSG 2×10" : "VSG 2×8";
    [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([w, n]) => {
        lines.push({ id: "panels", qty: n, unit: "pc", detail: `${glassSpec} · ${w} × ${panelH} mm` });
      });
    lines.push({ id: "baseProfile", qty: m, unit: "m", detail: cfg.mounting === "side" ? "seitlich / lateral" : "aufgesetzt / top" });
    if (cfg.handrail !== "none") lines.push({ id: "handrailPart", qty: m, unit: "m", detail: "Ø 42 mm inox" });
    lines.push({ id: "gaskets", qty: derived.panelCount, unit: "set", detail: `${PANEL_GAP} mm` });
    lines.push({ id: "anchors", qty: Math.ceil(derived.totalLength / 300), unit: "pc", detail: anchorSpec(cfg) + ", e=300 mm" });
  }

  lines.push({ id: "fixings", qty: 1, unit: "set", detail: "" });
  return lines;
}
