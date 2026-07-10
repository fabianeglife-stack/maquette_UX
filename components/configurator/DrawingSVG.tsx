"use client";

import { forwardRef, useMemo } from "react";
import { railDepth, type DerivedRailing } from "@/lib/engine/geometry";
import { buildBom } from "@/lib/engine/bom";
import type { RailingConfig, TypeProfile } from "@/lib/engine/types";
import { SIA_RULES_VERSION } from "@/lib/engine/sia";
import { PRICEBOOK_VERSION } from "@/lib/engine/pricing";
import { getDict, type Dict } from "@/lib/i18n";

const INK = "#171716";
const STONE = "#8b8b84";
const HAIR = "#d8d6cf";

interface Props {
  cfg: RailingConfig;
  derived: DerivedRailing;
  labels: Dict["cfg"]["drawing"];
  refNo: string;
  /** Resolved type: drives the principle-plan chains, section A-A and parts list. */
  tp?: TypeProfile;
  /** Locale for the parts-list labels. */
  locale?: string;
  typeName?: string;
}

/** One linear dimension (line + end ticks + label). */
interface DimSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  /** Label offset perpendicular to the line (px). */
  off?: number;
  size?: number;
}

const fmt = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

function Dim({ d }: { d: DimSpec }) {
  const dx = d.x2 - d.x1;
  const dy = d.y2 - d.y1;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector for the end ticks and label offset.
  const px = -dy / len;
  const py = dx / len;
  const mx = (d.x1 + d.x2) / 2;
  const my = (d.y1 + d.y2) / 2;
  const off = d.off ?? -4;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const flip = angle > 90 || angle < -90 ? 180 : 0;
  return (
    <g>
      <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={STONE} strokeWidth="0.8" />
      <line x1={d.x1 - px * 3.5} y1={d.y1 - py * 3.5} x2={d.x1 + px * 3.5} y2={d.y1 + py * 3.5} stroke={STONE} strokeWidth="0.8" />
      <line x1={d.x2 - px * 3.5} y1={d.y2 - py * 3.5} x2={d.x2 + px * 3.5} y2={d.y2 + py * 3.5} stroke={STONE} strokeWidth="0.8" />
      <text
        x={mx + px * off}
        y={my + py * off}
        fontSize={d.size ?? 8.5}
        fill={INK}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${angle + flip} ${mx + px * off} ${my + py * off})`}
      >
        {d.label}
      </text>
    </g>
  );
}

/**
 * Principle shop drawing following the client's fabrication plan layout:
 * dimensioned elevation (field chain, height chain, plate chain, check
 * diagonals), section A-A through the infill, plan view, parts list and
 * title block — all derived from the active configuration.
 */
const DrawingSVG = forwardRef<SVGSVGElement, Props>(function DrawingSVG(
  { cfg, derived, labels, refNo, tp, locale, typeName },
  ref,
) {
  const W = 1000;
  const H = 700;
  const bomDict: Dict["admin"]["bom"] | undefined = locale ? getDict(locale).admin.bom : undefined;

  const model = useMemo(() => {
    const recipe = tp?.recipe;
    const hrDepth = recipe ? railDepth(recipe.handrail.profile, recipe.handrail.size) : cfg.handrail === "none" ? 0 : 40;
    const brDepth = recipe ? railDepth(recipe.bottomRail.profile, recipe.bottomRail.size) : 20;
    const postSize = recipe ? (recipe.post.profile === "none" ? 0 : recipe.post.size) : cfg.system === "bars" ? 40 : 0;
    const plate = recipe?.plate;
    const inf = recipe?.infill;
    const flatW = inf?.flatW ?? 40;
    const flatT = inf?.flatT ?? inf?.memberSize ?? 5;
    const angle = ((inf?.angleDeg ?? 45) * Math.PI) / 180;
    // Projected width of one infill member along the run (drives A-A dims).
    const projW =
      inf?.kind === "vertical_flats"
        ? flatW * Math.cos(angle) + flatT * Math.sin(angle)
        : (inf?.memberSize ?? tp?.barDia ?? 12);

    // ----- developed elevation (left zone) -----
    const L = Math.max(derived.totalLength, 1);
    const maxRise = derived.segments.reduce((s, x) => s + Math.max(0, x.rise), 0);
    const sx = 560 / L;
    const sy = 190 / Math.max(cfg.height + maxRise, 1);
    const s = Math.min(sx, sy);

    const baseY = 312;
    const x0 = 80;
    let devX = x0;
    let devY = baseY;

    interface SegView {
      flat: boolean;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      h: number;
      posts: { x: number; yb: number; yt: number }[];
      bars: { x: number; yb: number; yt: number }[];
      rails: [number, number, number, number][];
      panels: string[];
      label: { x: number; y: number; text: string; angle: number };
      /** mm positions along this segment (for chains), flat segments only. */
      postT: number[];
      plateT: number[];
      barT: number[];
      lenMm: number;
    }
    const elev: SegView[] = [];

    derived.segments.forEach((seg) => {
      const dx = seg.input.length * Math.cos((seg.slopeDeg * Math.PI) / 180) * s;
      const dy = seg.rise * s;
      const x1 = devX + dx;
      const y1 = devY - dy;
      const h = cfg.height * s;
      const cosS = Math.cos((seg.slopeDeg * Math.PI) / 180);
      const segX0 = devX;
      const segY0 = devY;

      const tOf = (q: { x: number; y: number; z: number }) =>
        Math.hypot(q.x - seg.start.x, q.z - seg.start.z) / (cosS || 1);
      const mapPt = (q: { x: number; y: number; z: number }): [number, number] => {
        const t = tOf(q);
        const f = Math.min(1, t / seg.input.length);
        const axisY = seg.start.y + seg.dir.y * Math.min(t, seg.input.length);
        return [segX0 + dx * f, segY0 - dy * f - (q.y - axisY) * s];
      };

      const posts = seg.posts.map((p) => {
        const [x, yb] = mapPt(p.base);
        const yt = mapPt(p.top)[1];
        return { x, yb, yt };
      });
      const bars = seg.bars.map((b) => {
        const [x, yb] = mapPt(b.bottom);
        const yt = mapPt(b.top)[1];
        return { x, yb, yt };
      });
      const rails: [number, number, number, number][] = seg.rails.map(
        (r) => [...mapPt(r.bottom), ...mapPt(r.top)] as [number, number, number, number],
      );
      const panels: string[] = seg.panels.map((p) => {
        const f0 = tOf(p.a) / seg.input.length;
        const f1 = Math.min(1, (tOf(p.a) + p.width) / seg.input.length);
        const gx0 = segX0 + dx * f0;
        const gy0 = segY0 - dy * f0;
        const gx1 = segX0 + dx * f1;
        const gy1 = segY0 - dy * f1;
        const top = h - hrDepth * s;
        return [
          `${gx0},${gy0 - cfg.bottomGap * s}`,
          `${gx1},${gy1 - cfg.bottomGap * s}`,
          `${gx1},${gy1 - top}`,
          `${gx0},${gy0 - top}`,
        ].join(" ");
      });

      elev.push({
        flat: seg.slopeDeg === 0,
        x0: segX0,
        y0: segY0,
        x1,
        y1,
        h,
        posts,
        bars,
        rails,
        panels,
        label: {
          x: (segX0 + x1) / 2,
          y: segY0 - dy / 2 + 24,
          text: `${seg.input.length}${seg.input.stair ? ` / ${seg.slopeDeg}°` : ""}`,
          angle: (Math.atan2(-dy, dx) * 180) / Math.PI,
        },
        postT: seg.posts.map((p) => tOf(p.base)),
        plateT: seg.plates.map((p) => tOf(p.at)),
        barT: seg.bars.map((b) => tOf(b.bottom)),
        lenMm: seg.input.length,
      });
      devX = x1;
      devY = y1;
    });

    // ----- dimensions in the principle-plan style -----
    const dims: DimSpec[] = [];
    const diagonals: { x1: number; y1: number; x2: number; y2: number; label: string }[] = [];

    elev.forEach((e) => {
      if (!e.flat) return;
      const y = e.y0;
      const px = (t: number) => e.x0 + t * s;

      // Top chain: post faces + clear fields (plan: 20 | 980 | 20 | …).
      if (postSize > 0 && e.postT.length > 1) {
        const chainY = y - e.h - 16;
        const stops: number[] = [];
        e.postT.forEach((t) => {
          stops.push(t - postSize / 2, t + postSize / 2);
        });
        const inRange = stops.filter((t) => t >= -1 && t <= e.lenMm + 1);
        for (let i = 0; i < inRange.length - 1; i++) {
          const a = inRange[i];
          const b = inRange[i + 1];
          if (b - a < 1) continue;
          dims.push({ x1: px(a), y1: chainY, x2: px(b), y2: chainY, label: fmt(b - a) });
        }
        // Overall segment length above the chain.
        dims.push({ x1: px(0), y1: chainY - 16, x2: px(e.lenMm), y2: chainY - 16, label: fmt(e.lenMm), size: 9.5 });
      } else {
        dims.push({ x1: px(0), y1: y - e.h - 20, x2: px(e.lenMm), y2: y - e.h - 20, label: fmt(e.lenMm), size: 9.5 });
      }

      // Bottom chain: plates flush at the ends (plan: 105 | 855 | 105 | …).
      if (plate && e.plateT.length > 1) {
        const chainY = y + 16;
        const stops: number[] = [];
        e.plateT.forEach((t) => stops.push(t - plate.w / 2, t + plate.w / 2));
        for (let i = 0; i < stops.length - 1; i++) {
          const a = stops[i];
          const b = stops[i + 1];
          if (b - a < 1) continue;
          dims.push({ x1: px(a), y1: chainY, x2: px(b), y2: chainY, label: fmt(b - a), off: 7 });
        }
      }

      // Check diagonals across the clear opening (plan: 3149).
      if (postSize > 0 && e.lenMm >= 1200 && e.postT.length > 1) {
        const xa = px(e.postT[0] + postSize / 2);
        const xb = px(e.postT[e.postT.length - 1] - postSize / 2);
        const yTop = y - e.h + hrDepth * s;
        const yBot = y - (cfg.bottomGap + brDepth) * s;
        const dxMm = e.postT[e.postT.length - 1] - e.postT[0] - postSize;
        const dyMm = cfg.height - hrDepth - cfg.bottomGap - brDepth;
        const diag = fmt(Math.round(Math.hypot(dxMm, dyMm)));
        diagonals.push({ x1: xa, y1: yBot, x2: xb, y2: yTop, label: diag });
        diagonals.push({ x1: xa, y1: yTop, x2: xb, y2: yBot, label: "" });
      }
    });

    // Right height chain on the last segment end (plan: 20 | 1017 | 20 | 97 | 10).
    const endX = devX;
    const endY = devY;
    const chainX = endX + 16;
    const stopsY: { v: number; from: number }[] = [];
    {
      // Chain reads like the plan: 97 | 20 | 1017 | 20 from the slab
      // (plate thickness lives in the parts list, not the chain).
      const levels: number[] = [0];
      const lvBrBot = cfg.bottomGap;
      const lvBrTop = cfg.bottomGap + brDepth;
      const lvHrBot = cfg.height - hrDepth;
      const lvHrTop = cfg.height;
      [lvBrBot, lvBrTop, lvHrBot, lvHrTop].forEach((v) => {
        if (!levels.some((x) => Math.abs(x - v) < 0.5)) levels.push(v);
      });
      levels.sort((a, b) => a - b);
      for (let i = 0; i < levels.length - 1; i++) stopsY.push({ v: levels[i + 1] - levels[i], from: levels[i] });
    }
    let smallFlip = 0;
    stopsY.forEach((sv) => {
      if (sv.v < 1) return;
      // Short chain members: put the label on the free side, staggered.
      const short = sv.v * s < 13;
      dims.push({
        x1: chainX,
        y1: endY - sv.from * s,
        x2: chainX,
        y2: endY - (sv.from + sv.v) * s,
        label: fmt(sv.v),
        off: short ? 8 + (smallFlip++ % 2) * 11 : -6,
        size: short ? 7 : 8.5,
      });
    });
    dims.push({ x1: chainX + 36, y1: endY, x2: chainX + 36, y2: endY - cfg.height * s, label: fmt(cfg.height), off: -6, size: 9.5 });

    // ----- section A-A through the infill (first flat segment) -----
    const secSeg = elev.find((e) => e.flat && (e.bars.length > 0 || postSize > 0));
    let section: {
      y: number;
      posts: { x: number }[];
      plates: { x: number }[];
      bars: { x: number }[];
      dims: DimSpec[];
      x0: number;
      x1: number;
    } | null = null;
    if (secSeg && inf && (inf.kind === "vertical_flats" || inf.kind === "vertical_bars")) {
      const ySec = 372;
      const px = (t: number) => secSeg.x0 + t * s;
      const secDims: DimSpec[] = [];
      const bt = secSeg.barT;
      if (bt.length >= 2 && postSize > 0 && secSeg.postT.length > 0) {
        const dimY = ySec + Math.max(10, (plate?.l ?? 60) * s * 0.5) + 12;
        const faceT = secSeg.postT[0] + postSize / 2;
        const edge = bt[0] - projW / 2 - faceT;
        // Staggered label offsets — the three dims sit side by side.
        secDims.push({ x1: px(faceT), y1: dimY, x2: px(bt[0] - projW / 2), y2: dimY, label: fmt(edge), off: 8 });
        secDims.push({ x1: px(bt[0] + projW / 2), y1: dimY, x2: px(bt[1] - projW / 2), y2: dimY, label: fmt(bt[1] - bt[0] - projW), off: 18 });
        secDims.push({ x1: px(bt[1] - projW / 2), y1: dimY, x2: px(bt[1] + projW / 2), y2: dimY, label: fmt(projW), off: 28 });
      }
      section = {
        y: ySec,
        x0: secSeg.x0,
        x1: secSeg.x1,
        posts: secSeg.postT.map((t) => ({ x: px(t) })),
        plates: secSeg.plateT.map((t) => ({ x: px(t) })),
        bars: bt.map((t) => ({ x: px(t) })),
        dims: secDims,
      };
    }

    // ----- plan view (right zone) -----
    const b = derived.bounds;
    const pw = Math.max(b.maxX - b.minX, 1);
    const ph = Math.max(b.maxZ - b.minZ, 1);
    const ps = Math.min(250 / pw, 200 / ph, 0.12);
    const ox = 700 + (250 - pw * ps) / 2 - b.minX * ps;
    const oy = 120 + (200 - ph * ps) / 2 - b.minZ * ps;
    const plan = derived.segments.map((seg) => ({
      x1: ox + seg.start.x * ps,
      y1: oy + seg.start.z * ps,
      x2: ox + seg.end.x * ps,
      y2: oy + seg.end.z * ps,
      len: seg.input.length,
      angle: seg.input.angle,
      stair: seg.input.stair,
      slope: seg.slopeDeg,
    }));

    // ----- parts list -----
    const bom = buildBom(cfg, derived, tp);

    // Approximate print scale (sheet ≈ A3 landscape, 420 mm wide).
    const scaleDen = Math.max(1, Math.round(1 / (s * 0.42)));

    return {
      elev,
      dims,
      diagonals,
      section,
      plan,
      bom,
      s,
      scaleDen,
      baseY,
      postSize,
      hrDepth,
      brDepth,
      plate,
      projW,
      infKind: inf?.kind,
      flatT,
      flatW,
      angleDeg: inf?.angleDeg ?? 45,
    };
  }, [cfg, derived, tp]);

  const date = new Date().toISOString().slice(0, 10);
  const s = model.s;
  const bomRows = model.bom.filter((l) => l.id !== "fixings").slice(0, 8);
  const tableTop = H - 108 - (bomRows.length + 1) * 14 - 18;

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full bg-white" fontFamily="Helvetica, Arial, sans-serif">
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      <rect x="14" y="14" width={W - 28} height={H - 28} fill="none" stroke={INK} strokeWidth="1.4" />

      {/* zone labels */}
      <text x="34" y="40" fontSize="11" letterSpacing="3" fill={STONE}>
        {labels.elevation.toUpperCase()}
      </text>
      <text x="700" y="88" fontSize="11" letterSpacing="3" fill={STONE}>
        {labels.plan.toUpperCase()}
      </text>
      <line x1="672" y1="30" x2="672" y2={tableTop - 12} stroke={HAIR} />

      {/* ----- developed elevation ----- */}
      {model.elev.map((e, i) => (
        <g key={i}>
          {/* floor line */}
          <line x1={e.x0 - (i === 0 ? 14 : 0)} y1={e.y0} x2={e.x1 + 8} y2={e.y1} stroke={INK} strokeWidth="1.1" />
          {/* handrail / top rail band */}
          <line
            x1={e.x0}
            y1={e.y0 - e.h + (model.hrDepth * s) / 2}
            x2={e.x1}
            y2={e.y1 - e.h + (model.hrDepth * s) / 2}
            stroke={INK}
            strokeWidth={Math.max(2, model.hrDepth * s)}
          />
          {/* bottom rail band */}
          {model.brDepth > 0 && e.bars.length > 0 && (
            <line
              x1={e.x0}
              y1={e.y0 - (cfg.bottomGap + model.brDepth / 2) * s}
              x2={e.x1}
              y2={e.y1 - (cfg.bottomGap + model.brDepth / 2) * s}
              stroke={INK}
              strokeWidth={Math.max(1.4, model.brDepth * s)}
            />
          )}
          {/* infill bars (projected width) */}
          {e.bars.map((b, k) => (
            <line key={k} x1={b.x} y1={b.yb} x2={b.x} y2={b.yt} stroke="#6f6f68" strokeWidth={Math.max(0.8, model.projW * s * 0.85)} />
          ))}
          {/* horizontal rails / cables */}
          {e.rails.map((r, k) => (
            <line key={`r${k}`} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} stroke={STONE} strokeWidth="0.9" />
          ))}
          {/* glass / sheet panels */}
          {e.panels.map((pts, k) => (
            <polygon key={k} points={pts} fill="#4d6172" fillOpacity="0.09" stroke="#4d6172" strokeOpacity="0.55" strokeWidth="1" />
          ))}
          {/* posts */}
          {e.posts.map((p, k) => (
            <line key={k} x1={p.x} y1={p.yb} x2={p.x} y2={p.yt} stroke={INK} strokeWidth={Math.max(2, model.postSize * s)} />
          ))}
          {/* base plates */}
          {model.plate &&
            e.flat &&
            e.posts.map((p, k) => (
              <rect
                key={`pl${k}`}
                x={p.x - (model.plate!.w * s) / 2}
                y={p.yb - model.plate!.t * s}
                width={model.plate!.w * s}
                height={Math.max(1.4, model.plate!.t * s)}
                fill={INK}
              />
            ))}
          {/* stair segment label */}
          {!e.flat && (
            <text x={e.label.x} y={e.label.y} fontSize="10" fill={INK} textAnchor="middle" transform={`rotate(${e.label.angle} ${e.label.x} ${e.label.y})`}>
              {e.label.text}
            </text>
          )}
        </g>
      ))}

      {/* check diagonals (plan principle: squareness check) */}
      {model.diagonals.map((d, i) => {
        const mx = (d.x1 + d.x2) / 2;
        const my = (d.y1 + d.y2) / 2;
        const ang = (Math.atan2(d.y2 - d.y1, d.x2 - d.x1) * 180) / Math.PI;
        return (
          <g key={i}>
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={STONE} strokeWidth="0.55" strokeDasharray="1.5 2.5" />
            {d.label && (
              <text x={mx} y={my - 4} fontSize="8.5" fill={STONE} textAnchor="middle" transform={`rotate(${ang > 90 || ang < -90 ? ang + 180 : ang} ${mx} ${my - 4})`}>
                {d.label}
              </text>
            )}
          </g>
        );
      })}

      {/* dimensions */}
      {model.dims.map((d, i) => (
        <Dim key={i} d={d} />
      ))}

      {/* total developed length */}
      <Dim
        d={{
          x1: model.elev[0]?.x0 ?? 80,
          y1: model.baseY + 40,
          x2: model.elev[model.elev.length - 1]?.x1 ?? 80,
          y2: model.baseY + 40,
          label: `Σ ${derived.totalLength}`,
          off: 8,
          size: 9.5,
        }}
      />

      {/* ----- section A-A ----- */}
      {model.section && (
        <g>
          <text x="34" y={model.section.y - 24} fontSize="11" letterSpacing="3" fill={STONE}>
            {labels.sectionAA.toUpperCase()} ( 1 : {model.scaleDen} )
          </text>
          {/* plates */}
          {model.plate &&
            model.section.plates.map((p, k) => (
              <rect
                key={`sp${k}`}
                x={p.x - (model.plate!.w * s) / 2}
                y={model.section!.y - (model.plate!.l * s) / 2}
                width={model.plate!.w * s}
                height={model.plate!.l * s}
                fill="none"
                stroke={STONE}
                strokeWidth="0.7"
              />
            ))}
          {/* posts (rect/round sections) */}
          {model.postSize > 0 &&
            model.section.posts.map((p, k) => (
              <rect
                key={`sq${k}`}
                x={p.x - (model.postSize * s) / 2}
                y={model.section!.y - ((tp?.recipe?.post.depth ?? model.postSize) * s) / 2}
                width={model.postSize * s}
                height={(tp?.recipe?.post.depth ?? model.postSize) * s}
                fill="#ffffff"
                stroke={INK}
                strokeWidth="1"
              />
            ))}
          {/* infill member sections */}
          {model.section.bars.map((b, k) =>
            model.infKind === "vertical_flats" ? (
              <rect
                key={`sb${k}`}
                x={b.x - (model.flatW * s) / 2}
                y={model.section!.y - (model.flatT * s) / 2}
                width={model.flatW * s}
                height={Math.max(1, model.flatT * s)}
                fill={INK}
                transform={`rotate(${-model.angleDeg} ${b.x} ${model.section!.y})`}
              />
            ) : (
              <circle key={`sb${k}`} cx={b.x} cy={model.section!.y} r={Math.max(0.8, (model.projW * s) / 2)} fill={INK} />
            ),
          )}
          {model.section.dims.map((d, i) => (
            <Dim key={`sd${i}`} d={d} />
          ))}
        </g>
      )}

      {/* ----- plan view ----- */}
      {model.plan.map((p, i) => (
        <g key={i}>
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={INK} strokeWidth={p.stair ? 1.6 : 2.6} strokeDasharray={p.stair ? "7 4" : undefined} />
          <circle cx={p.x1} cy={p.y1} r="2.6" fill={INK} />
          {i === model.plan.length - 1 && <circle cx={p.x2} cy={p.y2} r="2.6" fill={INK} />}
          <text x={(p.x1 + p.x2) / 2 + 8} y={(p.y1 + p.y2) / 2 - 8} fontSize="10" fill={INK}>
            {p.len}
            {p.stair ? ` / ${p.slope}°` : ""}
          </text>
          {i > 0 && (
            <text x={p.x1 + 10} y={p.y1 + 16} fontSize="9" fill={STONE}>
              {p.angle > 0 ? "+" : ""}
              {p.angle}°
            </text>
          )}
        </g>
      ))}

      {/* ----- parts list (cartouche style) ----- */}
      {bomDict && (
        <g>
          <text x="34" y={tableTop - 6} fontSize="11" letterSpacing="3" fill={STONE}>
            {labels.parts.toUpperCase()}
          </text>
          {(() => {
            const cols = [34, 76, 300, 620];
            const rowH = 14;
            const rows = bomRows;
            const yh = tableTop + 4;
            return (
              <g>
                <rect x={cols[0]} y={yh} width={cols[3] - cols[0]} height={(rows.length + 1) * rowH} fill="none" stroke={INK} strokeWidth="0.9" />
                <line x1={cols[0]} y1={yh + rowH} x2={cols[3]} y2={yh + rowH} stroke={INK} strokeWidth="0.9" />
                <line x1={cols[1]} y1={yh} x2={cols[1]} y2={yh + (rows.length + 1) * rowH} stroke={HAIR} />
                <line x1={cols[2]} y1={yh} x2={cols[2]} y2={yh + (rows.length + 1) * rowH} stroke={HAIR} />
                <text x={cols[0] + 6} y={yh + 10} fontSize="8.5" fill={STONE}>
                  {labels.qty.toUpperCase()}
                </text>
                <text x={cols[1] + 6} y={yh + 10} fontSize="8.5" fill={STONE}>
                  {labels.description.toUpperCase()}
                </text>
                <text x={cols[2] + 6} y={yh + 10} fontSize="8.5" fill={STONE}>
                  {labels.dims.toUpperCase()}
                </text>
                {rows.map((l, i) => {
                  const y = yh + rowH * (i + 1) + 10;
                  return (
                    <g key={l.id + i}>
                      <text x={cols[0] + 6} y={y} fontSize="9" fill={INK}>
                        {l.qty} {bomDict.units[l.unit]}
                      </text>
                      <text x={cols[1] + 6} y={y} fontSize="9" fill={INK}>
                        {(bomDict.parts as Record<string, string>)[l.id] ?? l.id}
                      </text>
                      <text x={cols[2] + 6} y={y} fontSize="9" fill={INK}>
                        {l.detail}
                      </text>
                      {i < rows.length - 1 && (
                        <line x1={cols[0]} y1={yh + rowH * (i + 2)} x2={cols[3]} y2={yh + rowH * (i + 2)} stroke={HAIR} strokeWidth="0.6" />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </g>
      )}

      {/* non-binding watermark */}
      <text
        x={W / 2}
        y={300}
        fontSize="19"
        letterSpacing="4"
        fill="#b04a3a"
        fillOpacity="0.33"
        textAnchor="middle"
        transform={`rotate(-13 ${W / 2} 300)`}
      >
        {labels.watermark}
      </text>

      {/* ----- title block ----- */}
      <g>
        <line x1="34" y1={H - 96} x2={W - 34} y2={H - 96} stroke={INK} strokeWidth="1.2" />
        <text x="34" y={H - 20} fontSize="9.5" fill="#b04a3a">
          {labels.watermark}
        </text>
        <text x="34" y={H - 68} fontSize="16" letterSpacing="4" fill={INK} fontWeight="600">
          AXIO<tspan fontWeight="300">FORM</tspan>
        </text>
        <text x="34" y={H - 46} fontSize="10.5" fill={STONE}>
          {labels.title}
        </text>
        <text x="330" y={H - 68} fontSize="10" fill={STONE}>
          {labels.typeL}
        </text>
        <text x="330" y={H - 50} fontSize="11.5" fill={INK}>
          {typeName ?? tp?.name?.de ?? cfg.system}
        </text>
        <text x="330" y={H - 30} fontSize="10" fill={STONE}>
          {labels.rules}: {SIA_RULES_VERSION} · {PRICEBOOK_VERSION}
        </text>
        <text x="560" y={H - 68} fontSize="10" fill={STONE}>
          {labels.project}
        </text>
        <text x="560" y={H - 50} fontSize="11.5" fill={INK}>
          {refNo}
        </text>
        <text x="690" y={H - 68} fontSize="10" fill={STONE}>
          {labels.date}
        </text>
        <text x="690" y={H - 50} fontSize="11.5" fill={INK}>
          {date}
        </text>
        <text x="790" y={H - 68} fontSize="10" fill={STONE}>
          {labels.scaleApprox}
        </text>
        <text x="790" y={H - 50} fontSize="11.5" fill={INK}>
          1 : {model.scaleDen} · {labels.scale}
        </text>
        <text x="560" y={H - 30} fontSize="10" fill={STONE}>
          {labels.config}: H {cfg.height} ·{" "}
          {derived.panelCount > 0
            ? `${derived.panelCount} ${cfg.system === "glass" ? "VSG" : "EL"}`
            : derived.railCount > 0
              ? `${derived.postCount}P · ${derived.railCount}Q`
              : `${derived.postCount}P · ${derived.barCount}S`}
        </text>
      </g>
    </svg>
  );
});

export default DrawingSVG;
