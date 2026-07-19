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
import { materialOrderFor } from "../engine/procurement";

type Shape = any;

/** Cross-section perpendicular to the tube axis (Z). Hollow when wall > 0. */
export type Section =
  | { kind: "rect"; w: number; h: number; wall: number }
  | { kind: "round"; d: number; wall: number }
  | { kind: "flat"; w: number; t: number };

/** A straight prism of the section, from z0 along +Z by len. */
function prism(sec: Section, z0: number, len: number): Shape {
  if (sec.kind === "round") {
    const outer: Shape = makeCylinder(sec.d / 2, len, [0, 0, z0], [0, 0, 1]);
    return sec.wall > 0 ? outer.cut(makeCylinder(sec.d / 2 - sec.wall, len, [0, 0, z0], [0, 0, 1])) : outer;
  }
  const w = sec.w;
  const h = sec.kind === "flat" ? sec.t : sec.h;
  const outer: Shape = drawRectangle(w, h).sketchOnPlane("XY", z0).extrude(len);
  if (sec.kind === "rect" && sec.wall > 0) {
    return outer.cut(drawRectangle(w - 2 * sec.wall, h - 2 * sec.wall).sketchOnPlane("XY", z0).extrude(len));
  }
  return outer;
}

/** A large XY box spanning [z0, z0+h] used to trim one end of a solid. */
function trimBox(z0: number, h: number): Shape {
  const box: Shape = drawRectangle(2000, 2000).sketchOnPlane("XY", z0).extrude(h);
  return box;
}

export interface StretchOptions {
  /** Distance from each end that is straight (past the notch features), mm. */
  margin: number;
  /** Cross-section to rebuild the middle with (must match the template). */
  section: Section;
}

/**
 * Return the template tube resized to `targetLen` along its Z axis, preserving
 * the notched geometry within `margin` of each end. Robust because the middle
 * is rebuilt from the exact section rather than deformed.
 */
export async function stretchTube(templateBytes: Uint8Array, targetLen: number, opts: StretchOptions): Promise<Uint8Array> {
  const shape: Shape = await importSTEP(new Blob([templateBytes as any]));
  const bb = shape.boundingBox.bounds as [number[], number[]];
  const zmin = bb[0][2];
  const zmax = bb[1][2];
  const nominal = zmax - zmin;
  const margin = Math.min(opts.margin, nominal / 2 - 1);
  const delta = targetLen - nominal;

  // Keep the bottom end (with its notch): trim off everything above zmin+margin.
  const bottom = shape.clone().cut(trimBox(zmin + margin, nominal + 1000));
  // Keep the top end: trim off everything below zmax-margin, then shift by delta.
  const top = shape
    .clone()
    .cut(trimBox(zmin - 1000, (zmax - margin) - (zmin - 1000)))
    .translate([0, 0, delta]);
  // Rebuild the straight middle from the exact section.
  const mid = prism(opts.section, zmin + margin, nominal - 2 * margin + delta);

  const out = bottom.fuse(mid).fuse(top);
  const blob = await out.blobSTEP();
  return new Uint8Array(await blob.arrayBuffer());
}

/** The tube role a template is keyed by — mirrors the BOM/material line ids. */
export type TubeRole = "posts" | "bars" | "railsPart" | "handrailPart" | "bottomRail";

/** A stored template: the Inventor STEP (base64) plus its straight-end margin. */
export interface StepTemplate {
  step: string; // data URI or base64 of the .step
  marginMm?: number;
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
  const pieces: OrderStepPiece[] = [];
  const cleanRef = ref.replace(/^AX-/, "");

  for (const line of mat.lines) {
    const role = line.id as TubeRole;
    const tpl = roleTpls[role];
    const section = sectionFor(role, tp);
    if (!tpl || !tpl.step || !section) continue;
    const bytes = b64ToBytes(tpl.step);
    const margin = tpl.marginMm ?? Math.max(60, 2 * (section.kind === "round" ? section.d : Math.max(section.w, (section as any).h ?? (section as any).t)));
    // De-duplicate identical lengths but keep the per-piece count in the name.
    const counts = new Map<number, number>();
    for (const raw of line.pieces) {
      const len = Math.round(raw);
      const n = (counts.get(len) ?? 0) + 1;
      counts.set(len, n);
      const stepBytes = await stretchTube(bytes, len, { margin, section });
      pieces.push({ filename: `AX-${cleanRef}_${role}_${len}mm_${n}.step`, bytes: stepBytes });
    }
  }
  return pieces;
}
