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

/* ---------- parametric type recipes (admin type designer) ---------- */

export type PostProfile = "square" | "round" | "none";
export type InfillKind = "vertical_bars" | "horizontal_rails" | "cables" | "glass" | "sheet";
export type RailProfileKind = "round" | "flat" | "none";

/**
 * A guardrail described as a component recipe — the parametric master model
 * the admin edits in the type designer. Geometry, SIA checks, pricing, BOM
 * and drawings are all derived from it.
 */
export interface TypeRecipe {
  post: { profile: PostProfile; size: number; maxSpacing: number };
  infill: {
    kind: InfillKind;
    /** Member size: bar/rail/cable Ø, or panel thickness (glass/sheet), mm. */
    memberSize: number;
    /** Max clear opening between members (drives counts + SIA sphere rule). */
    maxOpening: number;
    /** Max panel width for glass/sheet infill, mm. */
    maxPanelWidth: number;
  };
  handrail: { profile: RailProfileKind; size: number };
  bottomRail: { profile: RailProfileKind; size: number };
  maxSlope: number;
}

export function defaultRecipe(): TypeRecipe {
  return {
    post: { profile: "square", size: 40, maxSpacing: 1250 },
    infill: { kind: "vertical_bars", memberSize: 12, maxOpening: 110, maxPanelWidth: 1200 },
    handrail: { profile: "round", size: 42 },
    bottomRail: { profile: "flat", size: 30 },
    maxSlope: 37,
  };
}

/** Effective infill kind of a type (legacy templates map to bars/glass). */
export function infillKindOf(tp?: TypeProfile): InfillKind {
  if (tp?.recipe) return tp.recipe.infill.kind;
  return tp?.template === "glass" ? "glass" : "vertical_bars";
}

/**
 * A guardrail type: template (bars/glass geometry logic) + parameter profile.
 * Built-in types ship with the product; custom types are created in the
 * admin type builder and carry their own names and parameters. Types created
 * in the type designer additionally carry a full component `recipe`.
 */
export interface TypeProfile {
  id: string;
  template: System;
  /** Custom display names; built-ins resolve names from the i18n dict. */
  name?: { de: string; fr: string; en: string };
  /** Base price CHF/m; null → price book default for the template. */
  basePerM: number | null;
  /** Bar diameter, mm (bars template). */
  barDia: number;
  /** Maximum stair slope, degrees (0 = no stairs). */
  maxSlope: number;
  /** Maximum glass panel width, mm (glass template). */
  maxPanelWidth: number;
  active: boolean;
  builtin: boolean;
  /** Parametric component recipe (type-designer types). */
  recipe?: TypeRecipe;
}

export const builtinTypes: TypeProfile[] = [
  { id: "bars", template: "bars", basePerM: null, barDia: 12, maxSlope: 37, maxPanelWidth: 1200, active: true, builtin: true },
  { id: "glass", template: "glass", basePerM: null, barDia: 12, maxSlope: 0, maxPanelWidth: 1200, active: true, builtin: true },
];

export interface RailingConfig {
  system: System;
  /** Selected guardrail type; falls back to the template built-in. */
  typeId?: string;
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
    typeId: "bars",
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

/** Keep the handrail choice valid when switching types/systems. */
export function normalizeForType(cfg: RailingConfig, tp: TypeProfile): RailingConfig {
  let handrail = cfg.handrail;
  if (tp.recipe) {
    // Recipe types fix the handrail in the design.
    handrail = tp.recipe.handrail.profile === "none" ? "none" : tp.recipe.handrail.profile === "flat" ? "flat_steel" : "round_steel";
  } else {
    if (tp.template === "glass" && (handrail === "round_steel" || handrail === "flat_steel")) handrail = "round_inox";
    if (tp.template === "bars" && handrail === "none") handrail = "round_steel";
  }
  return { ...cfg, system: tp.template, typeId: tp.id, handrail };
}
