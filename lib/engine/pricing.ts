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
  /** Delta for hot-dip-galvanized-only (no powder coating), CHF/m — typically negative. */
  galvanizedPerM: number;
  /** Substrate/fastening surcharges, CHF/m. */
  substratePerM: {
    concrete_top: number;
    concrete_side: number;
    concrete_side_offset: number;
    concrete_parapet: number;
    wood_side: number;
    stone_top: number;
  };
  publicUsagePerM: number;
  cornerEach: number;
  cornerEachGlass: number;
  setupFee: number;
  shippingFlat: number;
  freeShippingFrom: number;
  vatRate: number;
  /**
   * Payment terms: orders up to `fullUpfrontMax` (gross) are paid 100 % at
   * order; above it a `depositPct` deposit is due at order and the balance at
   * delivery. Every instalment is payable net within `netDays` days.
   */
  paymentTerms: { fullUpfrontMax: number; depositPct: number; netDays: number };
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
  galvanizedPerM: -15,
  substratePerM: { concrete_top: 0, concrete_side: 0, concrete_side_offset: 8, concrete_parapet: 14, wood_side: 0, stone_top: 18 },
  publicUsagePerM: 15,
  cornerEach: 35,
  cornerEachGlass: 55,
  setupFee: 120,
  shippingFlat: 89,
  freeShippingFrom: 3000,
  vatRate: 0.081,
  paymentTerms: { fullUpfrontMax: 2000, depositPct: 0.5, netDays: 30 },
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
  /** B2B trade discount (0–1), applied to goods before shipping and VAT. */
  discountRate = 0,
): PriceResult {
  const m = derived.totalLength / 1000;
  const stairM = derived.slopedLength / 1000;
  // A trade tier out of the documented 0–1 range must never corrupt totals.
  const rate = Math.min(1, Math.max(0, discountRate));
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

  // Finish: galvanized-only skips the powder coating (and any colour surcharge).
  if (cfg.finish === "galvanized") {
    lines.push({ id: "finish_galvanized", qty: r2(m), unit: "m", unitPrice: pb.galvanizedPerM, total: r2(m * pb.galvanizedPerM), params: {} });
  } else {
    const col = pb.colorPerM[cfg.color];
    if (col > 0) {
      lines.push({ id: "color_custom", qty: r2(m), unit: "m", unitPrice: col, total: r2(m * col), params: {} });
    }
  }
  if (cfg.mounting === "side") {
    lines.push({ id: "side_mount", qty: r2(m), unit: "m", unitPrice: pb.sideMountPerM, total: r2(m * pb.sideMountPerM), params: {} });
  }
  const subPerM = pb.substratePerM[cfg.substrate ?? "concrete_top"] ?? 0;
  if (subPerM > 0) {
    lines.push({ id: `substrate_${cfg.substrate}`, qty: r2(m), unit: "m", unitPrice: subPerM, total: r2(m * subPerM), params: {} });
  }
  if (cfg.usage === "public") {
    lines.push({ id: "public", qty: r2(m), unit: "m", unitPrice: pb.publicUsagePerM, total: r2(m * pb.publicUsagePerM), params: {} });
  }
  if (derived.cornerCount > 0) {
    const each = cfg.system === "glass" ? pb.cornerEachGlass : pb.cornerEach;
    lines.push({ id: "corners", qty: derived.cornerCount, unit: "pc", unitPrice: each, total: r2(derived.cornerCount * each), params: {} });
  }
  lines.push({ id: "setup", qty: 1, unit: "flat", unitPrice: pb.setupFee, total: pb.setupFee, params: {} });

  let netBeforeShipping = lines.reduce((s, l) => s + l.total, 0);
  if (rate > 0) {
    const rebate = r2(-netBeforeShipping * rate);
    lines.push({
      id: "b2b_discount",
      qty: 1,
      unit: "flat",
      unitPrice: rebate,
      total: rebate,
      params: { pct: Math.round(rate * 100) },
    });
    netBeforeShipping += rebate;
  }
  const shipping = netBeforeShipping >= pb.freeShippingFrom ? 0 : pb.shippingFlat;
  lines.push({ id: "shipping", qty: 1, unit: "flat", unitPrice: shipping, total: shipping, params: { weight: derived.weightKg } });

  const net = r2(netBeforeShipping + shipping);
  const vat = r2(net * pb.vatRate);
  return { lines, net, vat, gross: r2(net + vat), version: pb.version };
}

export interface PaymentPlan {
  /** Amount due at order (100 % or the deposit). */
  deposit: number;
  /** Amount due at delivery (0 when paid fully upfront). */
  balance: number;
  /** Whether the order is split into deposit + delivery instalments. */
  split: boolean;
  netDays: number;
}

/** Derive the instalment plan for a gross order total from the price book. */
export function paymentPlan(gross: number, pb: PriceBook = defaultPriceBook): PaymentPlan {
  const terms = pb.paymentTerms ?? defaultPriceBook.paymentTerms;
  if (gross <= terms.fullUpfrontMax) {
    return { deposit: r2(gross), balance: 0, split: false, netDays: terms.netDays };
  }
  const deposit = r2(gross * terms.depositPct);
  return { deposit, balance: r2(gross - deposit), split: true, netDays: terms.netDays };
}

export function chf(n: number): string {
  return (
    "CHF " +
    n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/’|'/g, " ")
  );
}
