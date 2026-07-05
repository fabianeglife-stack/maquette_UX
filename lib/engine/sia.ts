/*
 * SIA 358 compliance engine.
 * Declarative rules evaluated against a RailingConfig + derived geometry.
 * Labels are i18n keys resolved by the UI; `params` fills placeholders.
 */

import type { DerivedRailing } from "./geometry";
import { infillKindOf, MAX_POST_SPACING, MAX_SEGMENT_LENGTH, SYSTEM_MAX_SLOPE, type RailingConfig, type TypeProfile } from "./types";

export type RuleStatus = "pass" | "warn" | "fail";

export interface RuleResult {
  id: string;
  status: RuleStatus;
  /** Norm reference shown to the user. */
  ref: string;
  params: Record<string, string | number>;
}

export const SIA_RULES_VERSION = "SIA358-2010/rev1";

export function evaluateSia(cfg: RailingConfig, derived: DerivedRailing, tp?: TypeProfile): RuleResult[] {
  const results: RuleResult[] = [];
  const maxSlope = tp?.maxSlope ?? (cfg.system === "glass" ? 0 : SYSTEM_MAX_SLOPE);
  const kind = infillKindOf(tp);
  const hasPosts = tp?.recipe ? tp.recipe.post.profile !== "none" : cfg.system === "bars";

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

  // 4 — Climbability: horizontal members between 0.15 m and 0.75 m act as a
  //     ladder — not permitted for public use, discouraged for residential.
  if (kind === "horizontal_rails" || kind === "cables") {
    results.push({
      id: "climbHoriz",
      status: cfg.usage === "public" ? "fail" : "warn",
      ref: "SIA 358, 3.1 / bfu",
      params: {},
    });
  } else {
    results.push({ id: "climb", status: "pass", ref: "SIA 358, 3.1", params: {} });
  }

  // 5 — Structural loads (SIA 261 line load for the selected usage).
  const q = cfg.usage === "public" ? "1.6" : "0.8";
  if (hasPosts) {
    const maxSpacing = Math.max(0, ...derived.segments.map((s) => s.postSpacing));
    const limit = MAX_POST_SPACING[cfg.usage];
    results.push({
      id: "loads",
      status: maxSpacing <= limit ? "pass" : "fail",
      ref: "SIA 261, 8.1.2",
      params: { q, spacing: Math.round(maxSpacing), limit },
    });
  } else {
    results.push({ id: "loadsGlass", status: "pass", ref: "SIA 261, 8.1.2", params: { q } });
  }
  if (kind === "glass") {
    // VSG laminated safety glass is mandatory for fall protection.
    results.push({
      id: "vsg",
      status: "pass",
      ref: "SIGAB 002",
      params: { glass: cfg.handrail === "none" ? "2×10" : "2×8" },
    });
    if (cfg.usage === "public" && cfg.handrail === "none") {
      results.push({ id: "freeEdgePublic", status: "warn", ref: "SIGAB 002", params: {} });
    }
  }

  // 6 — Stairs within the type's slope limit (0 = flat only, e.g. glass).
  const worstSlope = Math.max(0, ...cfg.segments.map((s) => (s.stair ? s.slope : 0)));
  if (maxSlope <= 0) {
    results.push({
      id: "glassStairs",
      status: worstSlope > 0 ? "fail" : "pass",
      ref: "System AxioForm Vitra",
      params: {},
    });
  } else {
    results.push({
      id: "slope",
      status: worstSlope <= maxSlope ? "pass" : "fail",
      ref: "System AxioForm Flex",
      params: { slope: worstSlope, limit: maxSlope },
    });
  }

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
