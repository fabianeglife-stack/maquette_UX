/*
 * Bill of materials: derives the production parts list from a configuration.
 * Labels are i18n keys resolved by the UI.
 */

import type { DerivedRailing } from "./geometry";
import { PANEL_GAP, type RailingConfig, type TypeProfile } from "./types";

export interface BomLine {
  id: string;
  qty: number;
  unit: "pc" | "m" | "set";
  detail: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildBom(cfg: RailingConfig, derived: DerivedRailing, tp?: TypeProfile): BomLine[] {
  const lines: BomLine[] = [];
  const m = r1(derived.totalLength / 1000);

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
    lines.push({ id: "anchors", qty: derived.postCount * (cfg.mounting === "side" ? 3 : 2), unit: "pc", detail: "M12" });
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
    lines.push({ id: "anchors", qty: Math.ceil(derived.totalLength / 300), unit: "pc", detail: "M12, e=300 mm" });
  }

  lines.push({ id: "fixings", qty: 1, unit: "set", detail: "" });
  return lines;
}
