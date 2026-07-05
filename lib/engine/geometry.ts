/*
 * Parametric geometry engine: derives posts, bars and the 3D polyline from a
 * RailingConfig. Single source of truth for the 3D scene, the 2D drawing,
 * the SIA validator and the pricing engine.
 */

import {
  BAR_DIA,
  MAX_PANEL_WIDTH,
  MAX_POST_SPACING,
  PANEL_GAP,
  type RailingConfig,
  type SegmentInput,
  type TypeProfile,
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

export interface DerivedPanel {
  /** Bottom edge start/end, at bottomGap height. */
  a: Vec3;
  b: Vec3;
  width: number;
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
  /** Horizontal members (rails/cables) running along the axis, recipe types. */
  rails: DerivedBar[];
  panels: DerivedPanel[];
  /** Actual clear opening between infill members or panel joint, mm. */
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
  /** Horizontal member count (rails/cables), recipe types. */
  railCount: number;
  panelCount: number;
  /** Approximate kit weight, kg. */
  weightKg: number;
  /** Plan bounding box for drawing layout. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function deriveRailing(cfg: RailingConfig, tp?: TypeProfile): DerivedRailing {
  const segments: DerivedSegment[] = [];
  let cursor: Vec3 = { x: 0, y: 0, z: 0 };
  let heading = 0;
  const maxSpacing = MAX_POST_SPACING[cfg.usage];
  const barDia = tp?.barDia ?? BAR_DIA;
  const maxPanel = tp?.maxPanelWidth ?? MAX_PANEL_WIDTH;

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

    const posts: DerivedPost[] = [];
    const bars: DerivedBar[] = [];
    const rails: DerivedBar[] = [];
    const panels: DerivedPanel[] = [];
    let actualClear = 0;
    let spacing = seg.length;
    const recipe = tp?.recipe;

    const at = (t: number, dy = 0): Vec3 => ({
      x: cursor.x + dir.x * t,
      y: cursor.y + dir.y * t + dy,
      z: cursor.z + dir.z * t,
    });

    if (recipe) {
      // ---- recipe-driven derivation (type-designer types) ----
      let fields = 1;
      if (recipe.post.profile !== "none") {
        const limit = Math.min(recipe.post.maxSpacing, maxSpacing);
        fields = Math.max(1, Math.ceil(seg.length / limit));
        spacing = seg.length / fields;
        for (let p = i === 0 ? 0 : 1; p <= fields; p++) {
          const base = at(p * spacing);
          posts.push({ base, top: { ...base, y: base.y + cfg.height } });
        }
      } else {
        spacing = 0;
      }

      const inf = recipe.infill;
      if (inf.kind === "vertical_bars") {
        const span = fields > 1 || recipe.post.profile !== "none" ? seg.length / fields : seg.length;
        const target = Math.min(cfg.barClear, inf.maxOpening);
        const n = Math.max(1, Math.ceil((span - target) / (inf.memberSize + target)));
        actualClear = (span - n * inf.memberSize) / (n + 1);
        for (let f = 0; f < fields; f++) {
          for (let b = 1; b <= n; b++) {
            const t = f * span + ((actualClear + inf.memberSize) * b - inf.memberSize / 2);
            const foot = at(t, cfg.bottomGap);
            bars.push({ bottom: foot, top: { ...foot, y: foot.y + (cfg.height - cfg.bottomGap - 40) } });
          }
        }
      } else if (inf.kind === "horizontal_rails" || inf.kind === "cables") {
        // Members parallel to the axis, stacked at ≤ maxOpening clear.
        const span = cfg.height - cfg.bottomGap - 40;
        const n = Math.max(1, Math.ceil((span - inf.maxOpening) / (inf.memberSize + inf.maxOpening)));
        actualClear = (span - n * inf.memberSize) / (n + 1);
        for (let r = 1; r <= n; r++) {
          const dy = cfg.bottomGap + (actualClear + inf.memberSize) * r - inf.memberSize / 2;
          rails.push({ bottom: at(0, dy), top: at(seg.length, dy) });
        }
      } else {
        // glass / sheet panels between joints of PANEL_GAP
        const n = Math.max(1, Math.ceil((seg.length - PANEL_GAP) / (inf.maxPanelWidth + PANEL_GAP)));
        const width = (seg.length - (n + 1) * PANEL_GAP) / n;
        actualClear = PANEL_GAP;
        for (let p = 0; p < n; p++) {
          const t0 = PANEL_GAP + p * (width + PANEL_GAP);
          panels.push({ a: at(t0, cfg.bottomGap), b: at(t0 + width, cfg.bottomGap), width });
        }
      }
    } else if (cfg.system === "bars") {
      // Posts: evenly spaced along the axis, sharing corner posts with the
      // previous segment (skip t=0 for all but the first segment).
      const fields = Math.max(1, Math.ceil(seg.length / maxSpacing));
      spacing = seg.length / fields;
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
      const span = spacing; // per field, along the axis
      const n = Math.max(1, Math.ceil((span - cfg.barClear) / (barDia + cfg.barClear)));
      actualClear = (span - n * barDia) / (n + 1);
      for (let f = 0; f < fields; f++) {
        for (let b = 1; b <= n; b++) {
          const t = f * spacing + ((actualClear + barDia) * b - barDia / 2);
          const foot: Vec3 = {
            x: cursor.x + dir.x * t,
            y: cursor.y + dir.y * t + cfg.bottomGap,
            z: cursor.z + dir.z * t,
          };
          bars.push({ bottom: foot, top: { ...foot, y: foot.y + (cfg.height - cfg.bottomGap - 40) } });
        }
      }
    } else {
      // Glass: continuous base profile, VSG panels of ≤ MAX_PANEL_WIDTH with
      // PANEL_GAP joints; no posts.
      const n = Math.max(1, Math.ceil((seg.length - PANEL_GAP) / (maxPanel + PANEL_GAP)));
      const width = (seg.length - (n + 1) * PANEL_GAP) / n;
      actualClear = PANEL_GAP;
      spacing = 0;
      for (let p = 0; p < n; p++) {
        const t0 = PANEL_GAP + p * (width + PANEL_GAP);
        const t1 = t0 + width;
        panels.push({
          a: { x: cursor.x + dir.x * t0, y: cursor.y + dir.y * t0 + cfg.bottomGap, z: cursor.z + dir.z * t0 },
          b: { x: cursor.x + dir.x * t1, y: cursor.y + dir.y * t1 + cfg.bottomGap, z: cursor.z + dir.z * t1 },
          width,
        });
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
      rails,
      panels,
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
  const railCount = segments.reduce((s, x) => s + x.rails.length, 0);
  const panelCount = segments.reduce((s, x) => s + x.panels.length, 0);

  // Rough kit weight. Bars: posts 40×40×4 steel ≈ 4.4 kg/m, bars Ø12 ≈ 0.9 kg/m,
  // handrail ≈ 2.5 kg/m. Glass: VSG ≈ 42 kg/m² + base profile ≈ 6 kg/m.
  // Recipe members scale with the square of the member size (solid steel).
  const recipe = tp?.recipe;
  const memberKgPerM = recipe ? recipe.infill.memberSize ** 2 * 0.0062 : 0.9;
  const weightKg = recipe
    ? postCount * (cfg.height / 1000) * 4.4 * (recipe.post.size / 40) +
      barCount * ((cfg.height - cfg.bottomGap) / 1000) * memberKgPerM +
      segments.reduce((s, x) => s + x.rails.length * (x.input.length / 1000), 0) * memberKgPerM +
      (recipe.infill.kind === "glass"
        ? (totalLength / 1000) * ((cfg.height - cfg.bottomGap) / 1000) * 42
        : recipe.infill.kind === "sheet"
          ? (totalLength / 1000) * ((cfg.height - cfg.bottomGap) / 1000) * 11
          : 0) +
      (totalLength / 1000) * (recipe.handrail.profile === "none" ? 0 : 2.5) +
      (totalLength / 1000) * (recipe.bottomRail.profile === "none" ? 0 : 1.4) +
      postCount * 0.6
    : cfg.system === "bars"
      ? postCount * (cfg.height / 1000) * 4.4 +
        barCount * ((cfg.height - cfg.bottomGap) / 1000) * 0.9 +
        (totalLength / 1000) * 2.5 +
        postCount * 0.6
      : ((totalLength / 1000) * ((cfg.height - cfg.bottomGap) / 1000)) * 42 +
        (totalLength / 1000) * (6 + (cfg.handrail === "none" ? 0 : 2.5));

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
    railCount,
    panelCount,
    weightKg: Math.round(weightKg),
    bounds,
  };
}
