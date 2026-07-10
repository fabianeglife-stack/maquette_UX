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
  WALL_CLEARANCE,
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

/** Base plate under a post (recipe types). */
export interface DerivedPlate {
  at: Vec3;
  headingDeg: number;
}

/** Cable end fitting: swaged terminal + tensioner at a terminal post. */
export interface DerivedTensioner {
  at: Vec3;
  /** Point 60 mm inward along the cable, for orientation. */
  end: Vec3;
}

/** Glass point-fixing clamp at a panel edge (recipe glass with posts). */
export interface DerivedClamp {
  at: Vec3;
  headingDeg: number;
}

/** Handrail corner/slope joint (miter elbow or bend). */
export interface DerivedJoint {
  at: Vec3;
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
  /** Base plates under posts (recipe types). */
  plates: DerivedPlate[];
  /** Cable end fittings at terminal posts (recipe cable types). */
  tensioners: DerivedTensioner[];
  /** Post caps (recipe types without a handrail). */
  caps: Vec3[];
  /** Glass clamps (recipe glass with posts). */
  clamps: DerivedClamp[];
  /** Tread grid for stair segments (nosing line = segment axis). */
  steps: { count: number; len: number } | null;
  /** Actual worst clear opening in the infill ladder, mm. */
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
  /** Handrail corner/slope joints at segment junctions (recipe types). */
  joints: DerivedJoint[];
  /** Approximate kit weight, kg. */
  weightKg: number;
  /** Plan bounding box for drawing layout. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
}

/** Vertical extent taken by a rail profile (flat profiles are 8 mm thick). */
export function railDepth(profile: "round" | "flat" | "rect" | "none", size: number): number {
  return profile === "none" ? 0 : profile === "flat" ? 8 : size;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function deriveRailing(cfg: RailingConfig, tp?: TypeProfile): DerivedRailing {
  const segments: DerivedSegment[] = [];
  let cursor: Vec3 = { x: 0, y: 0, z: 0 };
  let heading = 0;
  const maxSpacing = MAX_POST_SPACING[cfg.usage];
  const barDia = tp?.barDia ?? BAR_DIA;
  const maxPanel = tp?.maxPanelWidth ?? MAX_PANEL_WIDTH;

  // Wall connections: the customer measures to the wall; the fabricated
  // element is shorter by the wall clearance at each connected end.
  const walls = cfg.walls ?? "none";
  const last = cfg.segments.length - 1;
  const effSegments: SegmentInput[] = cfg.segments.map((s, i) => {
    let len = s.length;
    if ((walls === "start" || walls === "both") && i === 0) len -= WALL_CLEARANCE;
    if ((walls === "end" || walls === "both") && i === last) len -= WALL_CLEARANCE;
    return len === s.length ? s : { ...s, length: Math.max(250, len) };
  });

  effSegments.forEach((seg, i) => {
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
    const plates: DerivedPlate[] = [];
    const tensioners: DerivedTensioner[] = [];
    const caps: Vec3[] = [];
    const clamps: DerivedClamp[] = [];
    let actualClear = 0;
    let spacing = seg.length;
    const recipe = tp?.recipe;

    const at = (t: number, dy = 0): Vec3 => ({
      x: cursor.x + dir.x * t,
      y: cursor.y + dir.y * t + dy,
      z: cursor.z + dir.z * t,
    });

    // Tread grid for stair segments. The segment axis is the nosing line:
    // treads sit below it, so members offset upward never clip the steps.
    const stepCount = seg.stair && slope > 0 ? Math.max(2, Math.round((dir.y * seg.length) / 175)) : 0;
    const stepLen = stepCount > 0 ? seg.length / stepCount : 0;
    const treadY = (t: number): number => {
      if (stepCount === 0) return cursor.y + dir.y * t;
      const s = Math.floor(t / stepLen + 1e-6);
      return cursor.y + dir.y * Math.min(s * stepLen, seg.length);
    };

    if (recipe) {
      // ---- recipe-driven derivation (type-designer types) ----
      const postHalf = recipe.post.profile === "none" ? 0 : recipe.post.size / 2;
      const hrDepth = railDepth(recipe.handrail.profile, recipe.handrail.size);
      const brDepth = railDepth(recipe.bottomRail.profile, recipe.bottomRail.size);

      let fields = 1;
      if (recipe.post.profile !== "none") {
        const limit = Math.min(recipe.post.maxSpacing, maxSpacing);
        fields = Math.max(1, Math.ceil(seg.length / limit));
        spacing = seg.length / fields;
        for (let p = i === 0 ? 0 : 1; p <= fields; p++) {
          const t = p * spacing;
          const axis = at(t);
          // Base on the tread (stairs) or the slab; top welds to the handrail underside.
          const base = { ...axis, y: treadY(t) };
          posts.push({ base, top: { ...axis, y: axis.y + cfg.height - hrDepth } });
          // As-built plates (fixing detail): terminal plates sit flush with the
          // element end (plan: plates hors tout 3025 vs module 3020 → 2.5 mm
          // lip), so they shift inward relative to the end post axis.
          let plateAt = base;
          if (recipe.plate) {
            const isFirst = i === 0 && p === 0;
            const isLast = i === effSegments.length - 1 && p === fields;
            const sgn = isFirst ? 1 : isLast ? -1 : 0;
            const off = Math.max(0, recipe.plate.w / 2 - postHalf - 2.5);
            if (sgn !== 0 && off > 0) {
              plateAt = {
                x: base.x + Math.cos(rad(heading)) * off * sgn,
                y: base.y,
                z: base.z + Math.sin(rad(heading)) * off * sgn,
              };
            }
          }
          plates.push({ at: plateAt, headingDeg: heading });
          if (hrDepth === 0) caps.push({ ...axis, y: axis.y + cfg.height });
        }
      } else {
        spacing = 0;
      }

      const inf = recipe.infill;
      if (inf.kind === "vertical_bars") {
        // Bars welded between bottom rail (or bottom gap) and handrail underside,
        // framed per field between post faces.
        const barBot = cfg.bottomGap + brDepth;
        const barTop = cfg.height - (hrDepth > 0 ? hrDepth : 40);
        const span = recipe.post.profile !== "none" ? spacing : seg.length;
        const usable = span - 2 * postHalf;
        const target = Math.min(cfg.barClear, inf.maxOpening);
        const n = Math.max(1, Math.ceil((usable - target) / (inf.memberSize + target)));
        actualClear = (usable - n * inf.memberSize) / (n + 1);
        for (let f = 0; f < fields; f++) {
          for (let b = 1; b <= n; b++) {
            const t = f * span + postHalf + ((actualClear + inf.memberSize) * b - inf.memberSize / 2);
            const axis = at(t);
            bars.push({
              bottom: { ...axis, y: axis.y + barBot },
              top: { ...axis, y: axis.y + barTop },
            });
          }
        }
      } else if (inf.kind === "vertical_flats") {
        // Flat bars set at 45°, welded between bottom rail and handrail
        // underside at a fixed pitch, the group centred in each field
        // (as-built principle plan: PLAT 40×5, pitch 144.5).
        const barBot = cfg.bottomGap + brDepth;
        const barTop = cfg.height - (hrDepth > 0 ? hrDepth : 40);
        const flatW = inf.flatW ?? 40;
        const flatT = inf.flatT ?? inf.memberSize;
        const pitch = inf.pitch ?? inf.maxOpening + flatW;
        const span = recipe.post.profile !== "none" ? spacing : seg.length;
        const usable = span - 2 * postHalf;
        const n = Math.max(1, Math.floor(usable / pitch));
        const offset = (usable - (n - 1) * pitch) / 2;
        // Clear opening measured perpendicular between the 45° faces.
        actualClear = pitch - (flatW + flatT) * Math.SQRT1_2;
        for (let f = 0; f < fields; f++) {
          for (let b = 0; b < n; b++) {
            const t = f * span + postHalf + offset + b * pitch;
            const axis = at(t);
            bars.push({
              bottom: { ...axis, y: axis.y + barBot },
              top: { ...axis, y: axis.y + barTop },
            });
          }
        }
      } else if (inf.kind === "horizontal_rails" || inf.kind === "cables") {
        // Closed opening ladder from the bottom rail (or floor) up to the
        // handrail underside: every opening — including the top one — ≤ maxOpening.
        const yLow = brDepth > 0 ? cfg.bottomGap + brDepth : 0;
        const yHigh = cfg.height - hrDepth;
        const ladder = yHigh - yLow;
        const n = Math.max(1, Math.ceil((ladder - inf.maxOpening) / (inf.memberSize + inf.maxOpening)));
        actualClear = (ladder - n * inf.memberSize) / (n + 1);
        for (let r = 1; r <= n; r++) {
          const dy = yLow + (actualClear + inf.memberSize) * r - inf.memberSize / 2;
          if (inf.kind === "cables") {
            // Cables run continuously through drilled intermediate posts and
            // terminate with swaged tensioners at the segment end posts.
            const t0 = postHalf;
            const t1 = seg.length - postHalf;
            rails.push({ bottom: at(t0, dy), top: at(t1, dy) });
            if (postHalf > 0) {
              tensioners.push({ at: at(t0, dy), end: at(Math.min(t0 + 60, t1), dy) });
              tensioners.push({ at: at(t1, dy), end: at(Math.max(t1 - 60, t0), dy) });
            }
          } else {
            // Rails are cut pieces framed between post faces, one per field.
            const span = spacing || seg.length;
            for (let f = 0; f < fields; f++) {
              rails.push({ bottom: at(f * span + postHalf, dy), top: at((f + 1) * span - postHalf, dy) });
            }
          }
        }
      } else {
        // glass / sheet panels between joints of PANEL_GAP
        const n = Math.max(1, Math.ceil((seg.length - PANEL_GAP) / (inf.maxPanelWidth + PANEL_GAP)));
        const width = (seg.length - (n + 1) * PANEL_GAP) / n;
        actualClear = PANEL_GAP;
        const panelH = cfg.height - cfg.bottomGap - hrDepth;
        for (let p = 0; p < n; p++) {
          const t0 = PANEL_GAP + p * (width + PANEL_GAP);
          panels.push({ a: at(t0, cfg.bottomGap), b: at(t0 + width, cfg.bottomGap), width });
          if (inf.kind === "glass" && postHalf > 0) {
            // Point-fixing clamps on both vertical edges, at 1/4 and 3/4 height.
            for (const te of [t0, t0 + width]) {
              for (const frac of [0.25, 0.75]) {
                clamps.push({ at: at(te, cfg.bottomGap + panelH * frac), headingDeg: heading });
              }
            }
          }
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
      plates,
      tensioners,
      caps,
      clamps,
      steps: stepCount > 0 ? { count: stepCount, len: stepLen } : null,
      actualBarClear: actualClear,
      postSpacing: spacing,
      rise: dir.y * seg.length,
    });
    cursor = end;
  });

  // Handrail joints (miter elbows / stair bends) at segment junctions.
  const joints: DerivedJoint[] = [];
  const jointRecipe = tp?.recipe;
  if (jointRecipe && jointRecipe.handrail.profile !== "none") {
    const hrDepth = railDepth(jointRecipe.handrail.profile, jointRecipe.handrail.size);
    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1];
      const s = segments[i];
      if (s.input.angle !== 0 || s.slopeDeg !== prev.slopeDeg) {
        joints.push({ at: { ...s.start, y: s.start.y + cfg.height - hrDepth / 2 } });
      }
    }
  }

  const totalLength = effSegments.reduce((s, x) => s + x.length, 0);
  const slopedLength = effSegments.reduce((s, x) => s + (x.stair ? x.length : 0), 0);
  const postCount = segments.reduce((s, x) => s + x.posts.length, 0);
  const barCount = segments.reduce((s, x) => s + x.bars.length, 0);
  const railCount = segments.reduce((s, x) => s + x.rails.length, 0);
  const panelCount = segments.reduce((s, x) => s + x.panels.length, 0);

  // Rough kit weight. Bars: posts 40×40×4 steel ≈ 4.4 kg/m, bars Ø12 ≈ 0.9 kg/m,
  // handrail ≈ 2.5 kg/m. Glass: VSG ≈ 42 kg/m² + base profile ≈ 6 kg/m.
  // Recipe members scale with the square of the member size (solid steel).
  const recipe = tp?.recipe;
  const memberKgPerM = recipe
    ? recipe.infill.kind === "vertical_flats"
      ? (recipe.infill.flatW ?? 40) * (recipe.infill.flatT ?? recipe.infill.memberSize) * 0.00785
      : recipe.infill.memberSize ** 2 * 0.0062
    : 0.9;
  const weightKg = recipe
    ? postCount * (cfg.height / 1000) * 4.4 * (recipe.post.size / 40) +
      barCount * ((cfg.height - cfg.bottomGap) / 1000) * memberKgPerM +
      segments.reduce(
        (s, x) =>
          s +
          x.rails.reduce(
            (a, r) => a + Math.hypot(r.top.x - r.bottom.x, r.top.y - r.bottom.y, r.top.z - r.bottom.z) / 1000,
            0,
          ),
        0,
      ) *
        memberKgPerM +
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
    joints,
    weightKg: Math.round(weightKg),
    bounds,
  };
}
