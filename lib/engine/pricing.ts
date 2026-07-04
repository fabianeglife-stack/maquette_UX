/*
 * Rule-based per-meter pricing engine.
 * The PriceBook is versioned; in production it is edited in the admin
 * pricing configurator — here it ships as seed data calibrated to the
 * Swiss market (cf. metallbauXpress: bar railings from ~192 CHF/m).
 */

import type { DerivedRailing } from "./geometry";
import type { RailingConfig } from "./types";

export const PRICEBOOK_VERSION = "PB-2026-07";

export const priceBook = {
  basePerM: 192,
  handrailPerM: { round_steel: 0, flat_steel: 18, round_inox: 45 },
  colorPerM: { ral7016: 0, ral9005: 0, ral9010: 0, custom: 12 },
  stairPerM: 80,
  sideMountPerM: 25,
  publicUsagePerM: 15,
  cornerEach: 35,
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

export function priceRailing(cfg: RailingConfig, derived: DerivedRailing): PriceResult {
  const pb = priceBook;
  const m = derived.totalLength / 1000;
  const stairM = derived.slopedLength / 1000;
  const lines: PriceLine[] = [];

  lines.push({ id: "base", qty: r2(m), unit: "m", unitPrice: pb.basePerM, total: r2(m * pb.basePerM), params: {} });

  const hr = pb.handrailPerM[cfg.handrail];
  if (hr > 0) {
    lines.push({ id: `handrail_${cfg.handrail}`, qty: r2(m), unit: "m", unitPrice: hr, total: r2(m * hr), params: {} });
  }
  const col = pb.colorPerM[cfg.color];
  if (col > 0) {
    lines.push({ id: "color_custom", qty: r2(m), unit: "m", unitPrice: col, total: r2(m * col), params: {} });
  }
  if (stairM > 0) {
    lines.push({ id: "stair", qty: r2(stairM), unit: "m", unitPrice: pb.stairPerM, total: r2(stairM * pb.stairPerM), params: {} });
  }
  if (cfg.mounting === "side") {
    lines.push({ id: "side_mount", qty: r2(m), unit: "m", unitPrice: pb.sideMountPerM, total: r2(m * pb.sideMountPerM), params: {} });
  }
  if (cfg.usage === "public") {
    lines.push({ id: "public", qty: r2(m), unit: "m", unitPrice: pb.publicUsagePerM, total: r2(m * pb.publicUsagePerM), params: {} });
  }
  if (derived.cornerCount > 0) {
    lines.push({ id: "corners", qty: derived.cornerCount, unit: "pc", unitPrice: pb.cornerEach, total: r2(derived.cornerCount * pb.cornerEach), params: {} });
  }
  lines.push({ id: "setup", qty: 1, unit: "flat", unitPrice: pb.setupFee, total: pb.setupFee, params: {} });

  const netBeforeShipping = lines.reduce((s, l) => s + l.total, 0);
  const shipping = netBeforeShipping >= pb.freeShippingFrom ? 0 : pb.shippingFlat;
  lines.push({ id: "shipping", qty: 1, unit: "flat", unitPrice: shipping, total: shipping, params: { weight: derived.weightKg } });

  const net = r2(netBeforeShipping + shipping);
  const vat = r2(net * pb.vatRate);
  return { lines, net, vat, gross: r2(net + vat), version: PRICEBOOK_VERSION };
}

export function chf(n: number): string {
  return (
    "CHF " +
    n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/’|'/g, " ")
  );
}
