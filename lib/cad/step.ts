/*
 * STEP generation for the tube laser. We do NOT recompute the cut notches:
 * the user supplies an Inventor STEP template per tube role (which already
 * carries the correct copes/mitres at its ends). For each cut piece of an
 * order we take the matching template and adjust only its LENGTH — keeping
 * both notched ends intact and rebuilding the straight middle from the known
 * cross-section — then emit one STEP per piece.
 *
 * Server-only (pulls the OCCT kernel). Call `initOC()` before any function here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { drawRectangle, importSTEP, makeCylinder } from "replicad";
import type { RailingConfig, TypeProfile } from "../engine/types";
import type { DerivedRailing } from "../engine/geometry";
import { drillStationsFor, materialOrderFor } from "../engine/procurement";

type Shape = any;

/** Cross-section perpendicular to the tube axis (Z). Hollow when wall > 0.
 *  Kept only to classify which roles yield a laser-cut tube (see sectionFor);
 *  the length change no longer rebuilds the section — it reuses the template's
 *  own geometry (exact corners, wall, copes). */
export type Section =
  | { kind: "rect"; w: number; h: number; wall: number }
  | { kind: "round"; d: number; wall: number }
  | { kind: "flat"; w: number; t: number };

/** A large XY box spanning [z0, z0+h], used to trim a solid along Z. */
function trimBox(z0: number, h: number): Shape {
  return drawRectangle(4000, 4000).sketchOnPlane("XY", z0).extrude(h);
}
const BIG = 1e5;
/** Keep only the part of `s` at z ≤ z (a fresh clone). */
const keepBelow = (s: Shape, z: number): Shape => s.clone().cut(trimBox(z, BIG));
/** Keep only the part of `s` at z ≥ z (a fresh clone). */
const keepAbove = (s: Shape, z: number): Shape => s.clone().cut(trimBox(z - BIG, BIG));

/** Index (0/1/2) of the longest bounding-box extent — the tube's length axis. */
function longAxis(bb: [number[], number[]]): number {
  const d = [bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]];
  return d.indexOf(Math.max(d[0], d[1], d[2]));
}

/** Rotate a shape so its long axis lands on +Z; `back` undoes it. Inventor
 *  templates may be exported along any axis (e.g. a flat bar along X). */
function alignToZ(shape: Shape, axis: number): { s: Shape; back: (x: Shape) => Shape } {
  if (axis === 2) return { s: shape, back: (x: Shape) => x };
  if (axis === 0) return { s: shape.rotate(-90, [0, 0, 0], [0, 1, 0]), back: (x: Shape) => x.rotate(90, [0, 0, 0], [0, 1, 0]) };
  return { s: shape.rotate(90, [0, 0, 0], [1, 0, 0]), back: (x: Shape) => x.rotate(-90, [0, 0, 0], [1, 0, 0]) };
}

export interface StretchOptions {
  /** Optional through-holes to drill after resizing: stations (mm) measured
   *  from the piece centre along the tube axis. One per infill bar. */
  holes?: number[];
  /** Diameter of the drilled holes (mm). Required when `holes` is set. */
  holeDiaMm?: number;
}

/**
 * Return the template tube resized to `targetLen`, keeping BOTH coped ends fully
 * intact — only straight length is added to / removed from the middle, and the
 * cross-section (exact corners, wall thickness) comes from the template itself,
 * never a rebuilt guess. Axis-aware (aligns the template's long axis to Z),
 * re-centres the result, and optionally drills one through-hole per infill bar.
 */
export async function stretchTube(templateBytes: Uint8Array, targetLen: number, opts: StretchOptions): Promise<Uint8Array> {
  const shape0: Shape = await importSTEP(new Blob([templateBytes as any]));
  const axis = longAxis(shape0.boundingBox.bounds as [number[], number[]]);
  const { s: shape, back } = alignToZ(shape0, axis);
  const bb = shape.boundingBox.bounds as [number[], number[]];
  const zmin = bb[0][2];
  const zmax = bb[1][2];
  const cx = (bb[0][0] + bb[1][0]) / 2;
  const cy = (bb[0][1] + bb[1][1]) / 2;
  const nominal = zmax - zmin;
  const z0 = (zmin + zmax) / 2; // the straight middle of the tube
  const delta = targetLen - nominal;

  let out: Shape;
  if (Math.abs(delta) < 0.01) {
    out = shape;
  } else if (delta < 0) {
    // Shorten: remove a centred straight slab of |delta| — both ends untouched.
    const cut = -delta;
    out = keepBelow(shape, z0 - cut / 2).fuse(keepAbove(shape, z0 + cut / 2).translate([0, 0, -cut]));
  } else {
    // Lengthen: shift the top half up and tile a straight slab into the gap.
    const slabT = Math.min(delta, nominal * 0.25);
    const bottom = keepBelow(shape, z0);
    const top = keepAbove(shape, z0).translate([0, 0, delta]);
    const slab = keepAbove(keepBelow(shape, z0), z0 - slabT); // straight slab [z0-slabT, z0]
    let filler: Shape | null = null;
    let filled = 0;
    for (let k = 0; filled < delta - 0.01 && k < 200; k++) {
      const t = Math.min(slabT, delta - filled);
      let piece: Shape = t < slabT ? keepAbove(slab, z0 - t) : slab.clone();
      piece = piece.translate([0, 0, filled - (slabT - t)]);
      filler = filler ? filler.fuse(piece) : piece;
      filled += t;
    }
    out = bottom.fuse(filler).fuse(top);
  }

  // Re-centre along Z so drill stations (measured from the piece centre) align.
  const ob = out.boundingBox.bounds as [number[], number[]];
  out = out.translate([0, 0, -(ob[0][2] + ob[1][2]) / 2]);

  // Drill one through-hole per bar (axis = section Y), clear of the ends.
  if (opts.holes && opts.holeDiaMm && opts.holeDiaMm > 0) {
    const limit = targetLen / 2 - 15;
    for (const z of opts.holes) {
      if (Math.abs(z) > limit) continue;
      const tool: Shape = makeCylinder(opts.holeDiaMm / 2, 400, [cx, cy - 200, z], [0, 1, 0]);
      out = out.cut(tool);
    }
  }

  out = back(out);
  const blob = await out.blobSTEP();
  return new Uint8Array(await blob.arrayBuffer());
}

/** The tube role a template is keyed by — mirrors the BOM/material line ids. */
export type TubeRole = "posts" | "bars" | "railsPart" | "handrailPart" | "bottomRail";

/** A stored template: the Inventor STEP (base64) of one tube role. Rails
 *  (`handrailPart`/`bottomRail`) can carry a per-bar drilling pattern. */
export interface StepTemplate {
  step: string; // data URI or base64 of the .step
  /** Regenerate one through-hole per infill bar along this rail. */
  drilled?: boolean;
  /** Diameter of the per-bar holes (mm) when `drilled`. */
  holeDiaMm?: number;
}
export type StepTemplates = Record<string, Partial<Record<TubeRole, StepTemplate>>>;

/** Cross-section for a role, read from the type recipe. */
export function sectionFor(role: TubeRole, tp: TypeProfile): Section | null {
  const r = tp.recipe;
  if (!r) return null;
  const railSec = (p: { profile: string; size: number; depth?: number; wall?: number }): Section | null => {
    if (p.profile === "round") return { kind: "round", d: p.size, wall: p.wall ?? 0 };
    if (p.profile === "flat") return { kind: "flat", w: p.size, t: 8 };
    if (p.profile === "rect") return { kind: "rect", w: p.depth ?? p.size, h: p.size, wall: p.wall ?? 0 };
    return null;
  };
  switch (role) {
    case "posts": {
      const p = r.post;
      if (p.profile === "round") return { kind: "round", d: p.size, wall: p.wall ?? 0 };
      if (p.profile === "rect") return { kind: "rect", w: p.depth ?? p.size, h: p.size, wall: p.wall ?? 0 };
      if (p.profile === "square") return { kind: "rect", w: p.size, h: p.size, wall: p.wall ?? 0 };
      return null;
    }
    case "bars":
      return r.infill.kind === "vertical_flats"
        ? { kind: "flat", w: r.infill.flatW ?? 40, t: r.infill.flatT ?? r.infill.memberSize }
        : { kind: "round", d: r.infill.memberSize, wall: 0 };
    case "railsPart":
      return { kind: "round", d: r.infill.memberSize, wall: 0 };
    case "handrailPart":
      return railSec(r.handrail);
    case "bottomRail":
      return railSec(r.bottomRail);
  }
}

const b64ToBytes = (s: string): Uint8Array => {
  const base64 = s.includes("base64,") ? s.slice(s.indexOf("base64,") + 7) : s;
  return new Uint8Array(Buffer.from(base64, "base64"));
};

export interface OrderStepPiece {
  filename: string;
  bytes: Uint8Array;
}

/**
 * One STEP per cut piece of the order, resized from the role's template. Roles
 * without a template are skipped. Returns [] when nothing could be produced.
 */
export async function buildOrderSteps(
  ref: string,
  cfg: RailingConfig,
  derived: DerivedRailing,
  tp: TypeProfile,
  templates: StepTemplates,
): Promise<OrderStepPiece[]> {
  const roleTpls = templates[tp.id] ?? {};
  const mat = materialOrderFor(cfg, derived, tp);
  const drill = drillStationsFor(cfg, derived, tp);
  const pieces: OrderStepPiece[] = [];
  const cleanRef = ref.replace(/^AX-/, "");
  const railStations = (role: TubeRole): number[][] | undefined =>
    role === "handrailPart" ? drill.handrailPart : role === "bottomRail" ? drill.bottomRail : undefined;
  // Length of each segment's rail run — mirrors materialOrderFor's `runsM`.
  const railRun = (i: number): number =>
    Math.round(derived.segments[i].input.length / Math.cos((derived.segments[i].slopeDeg * Math.PI) / 180));

  for (const line of mat.lines) {
    const role = line.id as TubeRole;
    const tpl = roleTpls[role];
    const section = sectionFor(role, tp);
    // `section` is only a validity gate: it is null for non-tube lines (e.g.
    // baseProfile), which have no laser template.
    if (!tpl || !tpl.step || !section) continue;
    const bytes = b64ToBytes(tpl.step);
    const stations = railStations(role);

    // Drilled rails: iterate per segment (so each piece gets its own bar
    // stations, unaffected by the material line's length sort) and drill.
    if (tpl.drilled && stations && stations.length > 0) {
      const holeDia = tpl.holeDiaMm ?? 10;
      for (let i = 0; i < stations.length; i++) {
        const len = railRun(i);
        const stepBytes = await stretchTube(bytes, len, { holes: stations[i], holeDiaMm: holeDia });
        pieces.push({ filename: `AX-${cleanRef}_${role}_${len}mm_${i + 1}.step`, bytes: stepBytes });
      }
      continue;
    }

    // De-duplicate identical lengths but keep the per-piece count in the name.
    const counts = new Map<number, number>();
    for (const raw of line.pieces) {
      const len = Math.round(raw);
      const n = (counts.get(len) ?? 0) + 1;
      counts.set(len, n);
      const stepBytes = await stretchTube(bytes, len, {});
      pieces.push({ filename: `AX-${cleanRef}_${role}_${len}mm_${n}.step`, bytes: stepBytes });
    }
  }
  return pieces;
}
