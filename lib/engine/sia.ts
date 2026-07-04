/*
 * SIA 358 compliance engine.
 * Declarative rules evaluated against a RailingConfig + derived geometry.
 * Labels are i18n keys resolved by the UI; `params` fills placeholders.
 */

import type { DerivedRailing } from "./geometry";
import { MAX_POST_SPACING, MAX_SEGMENT_LENGTH, SYSTEM_MAX_SLOPE, type RailingConfig } from "./types";

export type RuleStatus = "pass" | "warn" | "fail";

export interface RuleResult {
  id: string;
  status: RuleStatus;
  /** Norm reference shown to the user. */
  ref: string;
  params: Record<string, string | number>;
}

export const SIA_RULES_VERSION = "SIA358-2010/rev1";

export function evaluateSia(cfg: RailingConfig, derived: DerivedRailing): RuleResult[] {
  const results: RuleResult[] = [];

  // 1 — Minimum guard height ≥ 1.00 m; 1.10 m recommended above 12 m fall height.
  if (cfg.height < 1000) {
    results.push({ id: "height", status: "fail", ref: "SIA 358, 2.11", params: { h: cfg.height } });
  } else if (cfg.fallHeightM > 12 && cfg.height < 1100) {
    results.push({ id: "height12", status: "warn", ref: "SIA 358 / bfu", params: { h: cfg.height } });
  } else {
    results.push({ id: "height", status: "pass", ref: "SIA 358, 2.11", params: { h: cfg.height } });
  }

  // 2 — Openings: no opening may pass a Ø12 cm sphere up to 0.75 m height.
  const worstClear = Math.max(0, ...derived.segments.map((s) => s.actualBarClear));
  results.push({
    id: "openings",
    status: worstClear <= 120 ? "pass" : "fail",
    ref: "SIA 358, 3.2",
    params: { clear: Math.round(worstClear) },
  });

  // 3 — Gap at the base (sphere rule applies there too).
  results.push({
    id: "bottomGap",
    status: cfg.bottomGap <= 120 ? "pass" : "fail",
    ref: "SIA 358, 3.2",
    params: { gap: cfg.bottomGap },
  });

  // 4 — Climbability: vertical infill without horizontal footholds between
  //     0.15 m and 0.75 m is compliant by construction for this system.
  results.push({ id: "climb", status: "pass", ref: "SIA 358, 3.1", params: {} });

  // 5 — Structural loads: post spacing is derived from the SIA 261 line load
  //     for the selected usage; report the governing values.
  const maxSpacing = Math.max(0, ...derived.segments.map((s) => s.postSpacing));
  const limit = MAX_POST_SPACING[cfg.usage];
  results.push({
    id: "loads",
    status: maxSpacing <= limit ? "pass" : "fail",
    ref: "SIA 261, 8.1.2",
    params: {
      q: cfg.usage === "public" ? "1.6" : "0.8",
      spacing: Math.round(maxSpacing),
      limit,
    },
  });

  // 6 — Stair slope within the system limit.
  const worstSlope = Math.max(0, ...cfg.segments.map((s) => (s.stair ? s.slope : 0)));
  results.push({
    id: "slope",
    status: worstSlope <= SYSTEM_MAX_SLOPE ? "pass" : "fail",
    ref: "System AxioForm Flex",
    params: { slope: worstSlope, limit: SYSTEM_MAX_SLOPE },
  });

  // 7 — Transportable kit segments.
  const longest = Math.max(0, ...cfg.segments.map((s) => s.length));
  results.push({
    id: "transport",
    status: longest <= MAX_SEGMENT_LENGTH ? "pass" : "warn",
    ref: "AxioForm Logistik",
    params: { len: longest, limit: MAX_SEGMENT_LENGTH },
  });

  return results;
}

export function siaSummary(results: RuleResult[]): RuleStatus {
  if (results.some((r) => r.status === "fail")) return "fail";
  if (results.some((r) => r.status === "warn")) return "warn";
  return "pass";
}
