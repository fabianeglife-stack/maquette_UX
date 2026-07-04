/*
 * Rule-based per-meter pricing engine.
 * The PriceBook is versioned and injectable — in the prototype the admin
 * pricing configurator persists overrides in the browser; in production it
 * lives in the database. Seed values are calibrated to the Swiss market
 * (cf. metallbauXpress: bars from ~192 CHF/m, glass from ~334 CHF/m).
 */

import type { DerivedRailing } from "./geometry";
import type { RailingConfig, TypeProfile } from "./types";

export const PRICEBOOK_VERSION = "PB-2026-07";

export interface PriceBook {
  version: string;
  basePerM: number;
  glassBasePerM: number;
  glassFreeEdgePerM: number;
  glassTypePerM: { clear: number; satin: number; tinted: number };
  handrailPerM: { round_steel: number; flat_steel: number; round_inox: number; none: number };
  colorPerM: { ral7016: number; ral9005: number; ral9010: number; custom: number };
  stairPerM: number;
  sideMountPerM: number;
  publicUsagePerM: number;
  cornerEach: number;
  cornerEachGlass: number;
  setupFee: number;
  shippingFlat: number;
  freeShippingFrom: number;
  vatRate: number;
}

export const defaultPriceBook: PriceBook = {
  version: PRICEBOOK_VERSION,
  basePerM: 192,
  glassBasePerM: 334,
  glassFreeEdgePerM: 99,
  glassTypePerM: { clear: 0, satin: 45, tinted: 38 },
  handrailPerM: { round_steel: 0, flat_steel: 18, round_inox: 45, none: 0 },
  colorPerM: { ral7016: 0, ral9005: 0, ral9010: 0, custom: 12 },
  stairPerM: 80,
  sideMountPerM: 25,
  publicUsagePerM: 15,
  cornerEach: 35,
  cornerEachGlass: 55,
  setupFee: 120,
  shippingFlat: 89,
  freeShippingFrom: 3000,
  vatRate: 0.081,
};

export interface PriceLine {
  id: string;
  qty: number;
  unit: "m" | "pc" | "flat";
  unitPrice: number;
  total: number;
  params: Record<string, string | number>;
}

export interface PriceResult {
  lines: PriceLine[];
  net: number;
  vat: number;
  gross: number;
  version: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function priceRailing(
  cfg: RailingConfig,
  derived: DerivedRailing,
  pb: PriceBook = defaultPriceBook,
  tp?: TypeProfile,
): PriceResult {
  const m = derived.totalLength / 1000;
  const stairM = derived.slopedLength / 1000;
  const lines: PriceLine[] = [];
  const baseBars = tp?.basePerM ?? pb.basePerM;
  const baseGlass = tp?.basePerM ?? pb.glassBasePerM;

  if (cfg.system === "bars") {
    lines.push({ id: "base", qty: r2(m), unit: "m", unitPrice: baseBars, total: r2(m * baseBars), params: {} });
    const hr = pb.handrailPerM[cfg.handrail];
    if (hr > 0) {
      lines.push({ id: `handrail_${cfg.handrail}`, qty: r2(m), unit: "m", unitPrice: hr, total: r2(m * hr), params: {} });
    }
    if (stairM > 0) {
      lines.push({ id: "stair", qty: r2(stairM), unit: "m", unitPrice: pb.stairPerM, total: r2(stairM * pb.stairPerM), params: {} });
    }
  } else {
    lines.push({ id: "base_glass", qty: r2(m), unit: "m", unitPrice: baseGlass, total: r2(m * baseGlass), params: {} });
    if (cfg.handrail === "none") {
      lines.push({ id: "glass_free_edge", qty: r2(m), unit: "m", unitPrice: pb.glassFreeEdgePerM, total: r2(m * pb.glassFreeEdgePerM), params: {} });
    }
    const gt = pb.glassTypePerM[cfg.glassType];
    if (gt > 0) {
      lines.push({ id: `glass_${cfg.glassType}`, qty: r2(m), unit: "m", unitPrice: gt, total: r2(m * gt), params: {} });
    }
  }

  const col = pb.colorPerM[cfg.color];
  if (col > 0) {
    lines.push({ id: "color_custom", qty: r2(m), unit: "m", unitPrice: col, total: r2(m * col), params: {} });
  }
  if (cfg.mounting === "side") {
    lines.push({ id: "side_mount", qty: r2(m), unit: "m", unitPrice: pb.sideMountPerM, total: r2(m * pb.sideMountPerM), params: {} });
  }
  if (cfg.usage === "public") {
    lines.push({ id: "public", qty: r2(m), unit: "m", unitPrice: pb.publicUsagePerM, total: r2(m * pb.publicUsagePerM), params: {} });
  }
  if (derived.cornerCount > 0) {
    const each = cfg.system === "glass" ? pb.cornerEachGlass : pb.cornerEach;
    lines.push({ id: "corners", qty: derived.cornerCount, unit: "pc", unitPrice: each, total: r2(derived.cornerCount * each), params: {} });
  }
  lines.push({ id: "setup", qty: 1, unit: "flat", unitPrice: pb.setupFee, total: pb.setupFee, params: {} });

  const netBeforeShipping = lines.reduce((s, l) => s + l.total, 0);
  const shipping = netBeforeShipping >= pb.freeShippingFrom ? 0 : pb.shippingFlat;
  lines.push({ id: "shipping", qty: 1, unit: "flat", unitPrice: shipping, total: shipping, params: { weight: derived.weightKg } });

  const net = r2(netBeforeShipping + shipping);
  const vat = r2(net * pb.vatRate);
  return { lines, net, vat, gross: r2(net + vat), version: pb.version };
}

export function chf(n: number): string {
  return (
    "CHF " +
    n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/’|'/g, " ")
  );
}
