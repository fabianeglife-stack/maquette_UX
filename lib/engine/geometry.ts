/*
 * Parametric geometry engine: derives posts, bars and the 3D polyline from a
 * RailingConfig. Single source of truth for the 3D scene, the 2D drawing,
 * the SIA validator and the pricing engine.
 */

import {
  BAR_DIA,
  MAX_POST_SPACING,
  type RailingConfig,
  type SegmentInput,
} from "./types";

export interface Vec3 {
  x: number; // plan east, mm
  y: number; // elevation, mm
  z: number; // plan north, mm
}

export interface DerivedPost {
  base: Vec3;
  top: Vec3;
}

export interface DerivedBar {
  bottom: Vec3;
  top: Vec3;
}

export interface DerivedSegment {
  input: SegmentInput;
  start: Vec3;
  end: Vec3;
  /** Unit direction along the (possibly sloped) railing axis. */
  dir: Vec3;
  headingDeg: number;
  slopeDeg: number;
  /** Number of posts on this segment (the shared corner post counts on the earlier segment). */
  posts: DerivedPost[];
  bars: DerivedBar[];
  /** Actual clear opening between bars, mm. */
  actualBarClear: number;
  /** Actual post spacing along the axis, mm. */
  postSpacing: number;
  rise: number;
}

export interface DerivedRailing {
  segments: DerivedSegment[];
  totalLength: number;
  slopedLength: number;
  cornerCount: number;
  postCount: number;
  barCount: number;
  /** Approximate kit weight, kg. */
  weightKg: number;
  /** Plan bounding box for drawing layout. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function deriveRailing(cfg: RailingConfig): DerivedRailing {
  const segments: DerivedSegment[] = [];
  let cursor: Vec3 = { x: 0, y: 0, z: 0 };
  let heading = 0;
  const maxSpacing = MAX_POST_SPACING[cfg.usage];

  cfg.segments.forEach((seg, i) => {
    if (i > 0) heading += seg.angle;
    const slope = seg.stair ? seg.slope : 0;
    const dir: Vec3 = {
      x: Math.cos(rad(heading)) * Math.cos(rad(slope)),
      y: Math.sin(rad(slope)),
      z: Math.sin(rad(heading)) * Math.cos(rad(slope)),
    };
    const end: Vec3 = {
      x: cursor.x + dir.x * seg.length,
      y: cursor.y + dir.y * seg.length,
      z: cursor.z + dir.z * seg.length,
    };

    // Posts: evenly spaced along the axis, sharing corner posts with the
    // previous segment (skip t=0 for all but the first segment).
    const fields = Math.max(1, Math.ceil(seg.length / maxSpacing));
    const spacing = seg.length / fields;
    const posts: DerivedPost[] = [];
    for (let p = i === 0 ? 0 : 1; p <= fields; p++) {
      const t = p * spacing;
      const base: Vec3 = {
        x: cursor.x + dir.x * t,
        y: cursor.y + dir.y * t,
        z: cursor.z + dir.z * t,
      };
      posts.push({ base, top: { ...base, y: base.y + cfg.height } });
    }

    // Bars: fill each post field with vertical bars at ≤ barClear openings.
    const bars: DerivedBar[] = [];
    let actualClear = 0;
    {
      const span = spacing; // per field, along the axis
      const n = Math.max(1, Math.ceil((span - cfg.barClear) / (BAR_DIA + cfg.barClear)));
      actualClear = (span - n * BAR_DIA) / (n + 1);
      for (let f = 0; f < fields; f++) {
        for (let b = 1; b <= n; b++) {
          const t = f * spacing + ((actualClear + BAR_DIA) * b - BAR_DIA / 2);
          const foot: Vec3 = {
            x: cursor.x + dir.x * t,
            y: cursor.y + dir.y * t + cfg.bottomGap,
            z: cursor.z + dir.z * t,
          };
          bars.push({ bottom: foot, top: { ...foot, y: foot.y + (cfg.height - cfg.bottomGap - 40) } });
        }
      }
    }

    segments.push({
      input: seg,
      start: cursor,
      end,
      dir,
      headingDeg: heading,
      slopeDeg: slope,
      posts,
      bars,
      actualBarClear: actualClear,
      postSpacing: spacing,
      rise: dir.y * seg.length,
    });
    cursor = end;
  });

  const totalLength = cfg.segments.reduce((s, x) => s + x.length, 0);
  const slopedLength = cfg.segments.reduce((s, x) => s + (x.stair ? x.length : 0), 0);
  const postCount = segments.reduce((s, x) => s + x.posts.length, 0);
  const barCount = segments.reduce((s, x) => s + x.bars.length, 0);

  // Rough kit weight: posts 40×40×4 steel ≈ 4.4 kg/m, bars Ø12 ≈ 0.9 kg/m,
  // handrail ≈ 2.5 kg/m, fixings lump.
  const weightKg =
    postCount * (cfg.height / 1000) * 4.4 +
    barCount * ((cfg.height - cfg.bottomGap) / 1000) * 0.9 +
    (totalLength / 1000) * 2.5 +
    postCount * 0.6;

  const xs = segments.flatMap((s) => [s.start.x, s.end.x]);
  const zs = segments.flatMap((s) => [s.start.z, s.end.z]);
  const ys = segments.flatMap((s) => [s.start.y, s.end.y]);
  const bounds = {
    minX: Math.min(0, ...xs),
    maxX: Math.max(0, ...xs),
    minZ: Math.min(0, ...zs),
    maxZ: Math.max(0, ...zs),
    maxY: Math.max(0, ...ys),
  };

  return {
    segments,
    totalLength,
    slopedLength,
    cornerCount: Math.max(0, cfg.segments.length - 1),
    postCount,
    barCount,
    weightKg: Math.round(weightKg),
    bounds,
  };
}
