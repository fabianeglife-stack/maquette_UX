/*
 * Domain model for the AxioForm configurator.
 * All lengths in millimetres unless suffixed otherwise.
 */

export type System = "bars" | "glass";
export type Mounting = "top" | "side";
/** Which ends of the railing run meet a wall (measurements are taken to the wall). */
export type WallEnds = "none" | "start" | "end" | "both";
/** Substrate + fastening situation, à la metallbauXpress "Befestigung". */
export type Substrate =
  | "concrete_top"
  | "concrete_side"
  | "concrete_side_offset"
  | "concrete_parapet"
  | "wood_side"
  | "stone_top";
/** Surface finish: hot-dip galvanized base, optionally powder-coated in the chosen RAL. */
export type Finish = "coated" | "galvanized";

/** Clearance we deduct at each wall connection, mm (customer measures to the wall). */
export const WALL_CLEARANCE = 50;

export const SUBSTRATE_MOUNTING: Record<Substrate, Mounting> = {
  concrete_top: "top",
  concrete_side: "side",
  concrete_side_offset: "side",
  concrete_parapet: "side",
  wood_side: "side",
  stone_top: "top",
};
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

export type PostProfile = "square" | "round" | "rect" | "none";
export type InfillKind = "vertical_bars" | "vertical_flats" | "horizontal_rails" | "cables" | "glass" | "sheet";
export type RailProfileKind = "round" | "flat" | "rect" | "none";

/**
 * A guardrail described as a component recipe — the parametric master model
 * the admin edits in the type designer. Geometry, SIA checks, pricing, BOM
 * and drawings are all derived from it.
 */
export interface TypeRecipe {
  post: {
    profile: PostProfile;
    /** Post dimension along the railing axis, mm (façade width for rect). */
    size: number;
    /** Rect posts: dimension perpendicular to the railing plane, mm. */
    depth?: number;
    /** Tube wall thickness for the BOM designation, mm. */
    wall?: number;
    maxSpacing: number;
  };
  infill: {
    kind: InfillKind;
    /** Member size: bar/rail/cable Ø, or panel thickness (glass/sheet), mm. */
    memberSize: number;
    /** Max clear opening between members (drives counts + SIA sphere rule). */
    maxOpening: number;
    /** Max panel width for glass/sheet infill, mm. */
    maxPanelWidth: number;
    /** vertical_flats: flat-bar section (width × thickness), mm. */
    flatW?: number;
    flatT?: number;
    /** vertical_flats: fixed member pitch (centre distance), mm. */
    pitch?: number;
    /** vertical_flats: plan rotation of the flats (0 = face-on, 45 = diagonal), degrees. */
    angleDeg?: number;
  };
  handrail: { profile: RailProfileKind; size: number; depth?: number; wall?: number };
  bottomRail: { profile: RailProfileKind; size: number; depth?: number; wall?: number };
  maxSlope: number;
  /** Config defaults applied when the type is selected (as-built dimensions). */
  defaults?: { height?: number; bottomGap?: number };
  /** Plate dims per role (real fixing detail), mm. */
  plate?: { w: number; l: number; t: number };
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
  /** Public principle-drawing / fixing-detail PDF shipped with the type. */
  planUrl?: string;
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
  {
    // As-built Acomet type, straight variant: same frame as the 45° plan
    // (tube inox 60×20×2, plates 105×135×10) with the 40×5 flats face-on —
    // the client's STEP prototype "Barreau 90°". Keeps the historic id "bars"
    // so existing configurations and orders continue to resolve.
    id: "bars",
    template: "bars",
    name: { de: "Staketen gerade Inox", fr: "Barreaudage droit inox", en: "Straight flat-bar stainless" },
    planUrl: "/plans/barreaudage-principe.pdf",
    basePerM: 390,
    barDia: 5,
    maxSlope: 37,
    maxPanelWidth: 1200,
    active: true,
    builtin: true,
    recipe: {
      post: { profile: "rect", size: 20, depth: 60, wall: 2, maxSpacing: 1000 },
      infill: { kind: "vertical_flats", memberSize: 5, maxOpening: 120, maxPanelWidth: 1200, flatW: 40, flatT: 5, pitch: 144.5, angleDeg: 0 },
      handrail: { profile: "rect", size: 20, depth: 60, wall: 2 },
      bottomRail: { profile: "rect", size: 20, depth: 60, wall: 2 },
      maxSlope: 37,
      defaults: { height: 1154, bottomGap: 97 },
      plate: { w: 105, l: 135, t: 10 },
    },
  },
  // Suppressed from the customer configurator (client sells the two
  // barreaudage variants); kept for existing orders/configs to resolve.
  { id: "glass", template: "glass", basePerM: null, barDia: 12, maxSlope: 0, maxPanelWidth: 1200, active: false, builtin: true },
  {
    // As-built Acomet type: plan 000001-1-140.000 "Barrière prototype — Barreau 45°"
    // (tube inox 60×20×2 frame, 40×5 flats at 45°, pitch 144.5, plates 105×135×10).
    id: "flat45",
    template: "bars",
    name: { de: "Staketen 45° Inox", fr: "Barreaudage 45° inox", en: "45° flat-bar stainless" },
    planUrl: "/plans/barreaudage-principe.pdf",
    basePerM: 420,
    barDia: 5,
    maxSlope: 0,
    maxPanelWidth: 1200,
    active: true,
    builtin: true,
    recipe: {
      post: { profile: "rect", size: 20, depth: 60, wall: 2, maxSpacing: 1000 },
      infill: { kind: "vertical_flats", memberSize: 5, maxOpening: 120, maxPanelWidth: 1200, flatW: 40, flatT: 5, pitch: 144.5, angleDeg: 45 },
      handrail: { profile: "rect", size: 20, depth: 60, wall: 2 },
      bottomRail: { profile: "rect", size: 20, depth: 60, wall: 2 },
      maxSlope: 0,
      defaults: { height: 1154, bottomGap: 97 },
      plate: { w: 105, l: 135, t: 10 },
    },
  },
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
  /** Wall connections at the run's ends; WALL_CLEARANCE is deducted per wall. */
  walls?: WallEnds;
  /** Substrate/fastening situation; implies the mounting position. */
  substrate?: Substrate;
  /** Surface finish; "galvanized" skips powder coating (color ignored). */
  finish?: Finish;
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
    walls: "none",
    substrate: "concrete_top",
    finish: "coated",
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
    const d = tp.recipe.defaults;
    if (d) {
      return {
        ...cfg,
        system: tp.template,
        typeId: tp.id,
        handrail,
        height: d.height ?? cfg.height,
        bottomGap: d.bottomGap ?? cfg.bottomGap,
      };
    }
  } else {
    if (tp.template === "glass" && (handrail === "round_steel" || handrail === "flat_steel")) handrail = "round_inox";
    if (tp.template === "bars" && handrail === "none") handrail = "round_steel";
  }
  return { ...cfg, system: tp.template, typeId: tp.id, handrail };
}
