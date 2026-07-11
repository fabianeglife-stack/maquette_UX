/*
 * Shared UI tokens consumed by the configurator 3D scene, the drawing/summary
 * views and the admin type designer. Kept in one place so the palette can't
 * drift between the copies that previously lived in each component.
 */

import type { RuleStatus } from "./engine/sia";
import type { RailingConfig } from "./engine/types";

/** RAL powder-coat colours mapped to display hex. */
export const RAL_HEX: Record<RailingConfig["color"], string> = {
  ral7016: "#383e42",
  ral9005: "#0e0e0e",
  ral9010: "#efece3",
  custom: "#4d6172",
};

/** Brushed stainless steel. */
export const INOX = "#b9bdbf";

/** SIA rule status → indicator colour. */
export const STATUS_COLOR: Record<RuleStatus, string> = {
  pass: "#4a7c59",
  warn: "#b9882f",
  fail: "#b04a3a",
};
