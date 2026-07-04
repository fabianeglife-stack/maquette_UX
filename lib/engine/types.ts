/*
 * Domain model for the AxioForm configurator.
 * All lengths in millimetres unless suffixed otherwise.
 */

export type System = "bars" | "glass";
export type Mounting = "top" | "side";
export type Handrail = "round_steel" | "flat_steel" | "round_inox" | "none";
export type GlassType = "clear" | "satin" | "tinted";
export type ColorOption = "ral7016" | "ral9005" | "ral9010" | "custom";
export type Usage = "residential" | "public";

export interface SegmentInput {
  id: string;
  /** True length measured along the railing axis. */
  length: number;
  /** Plan angle relative to the previous segment, degrees (-135..135). Ignored on the first segment. */
  angle: number;
  /** True for stair segments. */
  stair: boolean;
  /** Slope in degrees (only for stair segments). */
  slope: number;
}

export interface RailingConfig {
  system: System;
  height: number;
  /** Clear gap between finished floor and bottom rail / glass edge. */
  bottomGap: number;
  /** Target clear opening between bars (bar system). */
  barClear: number;
  glassType: GlassType;
  mounting: Mounting;
  handrail: Handrail;
  color: ColorOption;
  usage: Usage;
  /** Fall height behind the railing, metres (drives the 1.10 m recommendation). */
  fallHeightM: number;
  segments: SegmentInput[];
}

export const BAR_DIA = 12; // mm, round bar diameter
export const POST_SIZE = 40; // mm, square post
export const MAX_PANEL_WIDTH = 1200; // mm, VSG panel limit for handrail-less systems
export const PANEL_GAP = 20; // mm, joint between glass panels

export const MAX_POST_SPACING: Record<Usage, number> = {
  residential: 1250,
  public: 1000,
};

export const SYSTEM_MAX_SLOPE = 37; // degrees, bar system
export const MAX_SEGMENT_LENGTH = 6000; // transport limit per kit segment

let nextId = 1;
export function newSegment(partial?: Partial<SegmentInput>): SegmentInput {
  return {
    id: `s${Date.now().toString(36)}${(nextId++).toString(36)}`,
    length: 2000,
    angle: 0,
    stair: false,
    slope: 0,
    ...partial,
  };
}

export function defaultConfig(): RailingConfig {
  return {
    system: "bars",
    height: 1000,
    bottomGap: 100,
    barClear: 110,
    glassType: "clear",
    mounting: "top",
    handrail: "round_steel",
    color: "ral7016",
    usage: "residential",
    fallHeightM: 3,
    segments: [newSegment({ length: 3000 }), newSegment({ length: 2000, angle: 90 })],
  };
}

/** Keep the handrail choice valid when switching systems. */
export function normalizeForSystem(cfg: RailingConfig, system: System): RailingConfig {
  let handrail = cfg.handrail;
  if (system === "glass" && (handrail === "round_steel" || handrail === "flat_steel")) handrail = "round_inox";
  if (system === "bars" && handrail === "none") handrail = "round_steel";
  return { ...cfg, system, handrail };
}
