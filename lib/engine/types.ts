/*
 * Domain model for the AxioForm configurator.
 * All lengths in millimetres unless suffixed otherwise.
 */

export type Mounting = "top" | "side";
export type Handrail = "round_steel" | "flat_steel" | "round_inox";
export type ColorOption = "ral7016" | "ral9005" | "ral9010" | "custom";
export type Usage = "residential" | "public";

export interface SegmentInput {
  id: string;
  /** True length measured along the railing axis. */
  length: number;
  /** Plan angle relative to the previous segment, degrees (-90..90). Ignored on the first segment. */
  angle: number;
  /** True for stair segments. */
  stair: boolean;
  /** Slope in degrees (only for stair segments, 0..45 input, SIA system limit 37). */
  slope: number;
}

export interface RailingConfig {
  system: "bars";
  height: number;
  /** Clear gap between finished floor and bottom rail. */
  bottomGap: number;
  /** Target clear opening between bars. */
  barClear: number;
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

export const MAX_POST_SPACING: Record<Usage, number> = {
  residential: 1250,
  public: 1000,
};

export const SYSTEM_MAX_SLOPE = 37; // degrees
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
    mounting: "top",
    handrail: "round_steel",
    color: "ral7016",
    usage: "residential",
    fallHeightM: 3,
    segments: [newSegment({ length: 3000 }), newSegment({ length: 2000, angle: 90 })],
  };
}
