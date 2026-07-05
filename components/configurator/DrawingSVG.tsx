"use client";

import { forwardRef, useMemo } from "react";
import type { DerivedRailing } from "@/lib/engine/geometry";
import type { RailingConfig } from "@/lib/engine/types";
import { SIA_RULES_VERSION } from "@/lib/engine/sia";
import { PRICEBOOK_VERSION } from "@/lib/engine/pricing";
import type { Dict } from "@/lib/i18n";

const INK = "#171716";
const STONE = "#8b8b84";
const HAIR = "#d8d6cf";

interface Props {
  cfg: RailingConfig;
  derived: DerivedRailing;
  labels: Dict["cfg"]["drawing"];
  refNo: string;
}

/** Dimensioned 2D shop drawing: developed elevation + plan + title block. */
const DrawingSVG = forwardRef<SVGSVGElement, Props>(function DrawingSVG({ cfg, derived, labels, refNo }, ref) {
  const W = 1000;
  const H = 700;

  const model = useMemo(() => {
    // ----- developed elevation -----
    const L = Math.max(derived.totalLength, 1);
    const maxRise = derived.segments.reduce((s, x) => s + Math.max(0, x.rise), 0);
    const sx = 880 / L;
    const sy = Math.min(sx, 200 / Math.max(cfg.height + maxRise, 1));
    const s = Math.min(sx, sy);

    const baseY = 300;
    let devX = 60;
    let devY = baseY;
    const elev: {
      base: [number, number, number, number];
      top: [number, number, number, number];
      posts: [number, number, number, number][];
      bars: [number, number, number, number][];
      rails: [number, number, number, number][];
      panels: string[];
      label: { x: number; y: number; text: string; angle: number };
    }[] = [];

    derived.segments.forEach((seg) => {
      const dx = seg.input.length * Math.cos((seg.slopeDeg * Math.PI) / 180) * s;
      const dy = seg.rise * s;
      const x1 = devX + dx;
      const y1 = devY - dy;
      const h = cfg.height * s;

      // Map a derived 3D point into the developed elevation: plan distance
      // along the axis → x, height offset from the (sloped) axis → y.
      const cosS = Math.cos((seg.slopeDeg * Math.PI) / 180);
      const mapPt = (q: { x: number; y: number; z: number }): [number, number] => {
        const t = Math.hypot(q.x - seg.start.x, q.z - seg.start.z) / (cosS || 1);
        const f = Math.min(1, t / seg.input.length);
        const axisY = seg.start.y + seg.dir.y * Math.min(t, seg.input.length);
        return [devX + dx * f, devY - dy * f - (q.y - axisY) * s];
      };

      const posts: [number, number, number, number][] = seg.posts.map((p) => [...mapPt(p.base), ...mapPt(p.top)] as [number, number, number, number]);
      const bars: [number, number, number, number][] = seg.bars.map((b) => [...mapPt(b.bottom), ...mapPt(b.top)] as [number, number, number, number]);
      // Horizontal members (rails/cables): cut pieces framed between posts.
      const rails: [number, number, number, number][] = seg.rails.map((r) => [...mapPt(r.bottom), ...mapPt(r.top)] as [number, number, number, number]);

      const panels: string[] = seg.panels.map((p) => {
        const t0 = Math.hypot(p.a.x - seg.start.x, p.a.z - seg.start.z, p.a.y - cfg.bottomGap - seg.start.y);
        const f0 = t0 / seg.input.length;
        const f1 = Math.min(1, (t0 + p.width) / seg.input.length);
        const gx0 = devX + dx * f0;
        const gy0 = devY - dy * f0;
        const gx1 = devX + dx * f1;
        const gy1 = devY - dy * f1;
        const top = cfg.handrail === "none" ? h : h - 40 * s;
        return [
          `${gx0},${gy0 - cfg.bottomGap * s}`,
          `${gx1},${gy1 - cfg.bottomGap * s}`,
          `${gx1},${gy1 - top}`,
          `${gx0},${gy0 - top}`,
        ].join(" ");
      });

      elev.push({
        base: [devX, devY, x1, y1],
        top: [devX, devY - h, x1, y1 - h],
        posts,
        bars,
        rails,
        panels,
        label: {
          x: (devX + x1) / 2,
          y: devY - dy / 2 + 22,
          text: `${seg.input.length}`,
          angle: (Math.atan2(-dy, dx) * 180) / Math.PI,
        },
      });
      devX = x1;
      devY = y1;
    });

    const heightDim = { x: devX + 26, y1: devY, y2: devY - cfg.height * s };
    const totalDim = { x1: 60, x2: devX, y: baseY + 34 };

    // ----- plan view -----
    const b = derived.bounds;
    const pw = Math.max(b.maxX - b.minX, 1);
    const ph = Math.max(b.maxZ - b.minZ, 1);
    const ps = Math.min(700 / pw, 130 / ph, 0.12);
    const ox = 90 - b.minX * ps;
    const oy = 470 - b.minZ * ps;
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

    return { elev, heightDim, totalDim, plan };
  }, [cfg, derived]);

  const date = new Date().toISOString().slice(0, 10);

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full bg-white" fontFamily="Helvetica, Arial, sans-serif">
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      <rect x="14" y="14" width={W - 28} height={H - 28} fill="none" stroke={INK} strokeWidth="1.4" />

      {/* section labels */}
      <text x="34" y="52" fontSize="12" letterSpacing="3" fill={STONE}>
        {labels.elevation.toUpperCase()}
      </text>
      <text x="34" y="392" fontSize="12" letterSpacing="3" fill={STONE}>
        {labels.plan.toUpperCase()}
      </text>
      <line x1="34" y1="370" x2={W - 34} y2="370" stroke={HAIR} />

      {/* developed elevation */}
      {model.elev.map((e, i) => (
        <g key={i}>
          <line x1={e.base[0]} y1={e.base[1]} x2={e.base[2]} y2={e.base[3]} stroke={INK} strokeWidth="2.2" />
          <line x1={e.top[0]} y1={e.top[1]} x2={e.top[2]} y2={e.top[3]} stroke={INK} strokeWidth="2.6" />
          {e.bars.map((b, k) => (
            <line key={k} x1={b[0]} y1={b[1]} x2={b[2]} y2={b[3]} stroke={STONE} strokeWidth="0.7" />
          ))}
          {e.rails.map((r, k) => (
            <line key={`r${k}`} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} stroke={STONE} strokeWidth="0.9" />
          ))}
          {e.panels.map((pts, k) => (
            <polygon key={k} points={pts} fill="#4d6172" fillOpacity="0.09" stroke="#4d6172" strokeOpacity="0.55" strokeWidth="1" />
          ))}
          {e.posts.map((p, k) => (
            <line key={k} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} stroke={INK} strokeWidth="2.2" />
          ))}
          <text x={e.label.x} y={e.label.y} fontSize="11" fill={INK} textAnchor="middle" transform={`rotate(${e.label.angle} ${e.label.x} ${e.label.y})`}>
            {e.label.text}
          </text>
        </g>
      ))}
      {/* height dimension */}
      <g stroke={STONE} strokeWidth="1" fill="none">
        <line x1={model.heightDim.x} y1={model.heightDim.y1} x2={model.heightDim.x} y2={model.heightDim.y2} />
        <line x1={model.heightDim.x - 5} y1={model.heightDim.y1} x2={model.heightDim.x + 5} y2={model.heightDim.y1} />
        <line x1={model.heightDim.x - 5} y1={model.heightDim.y2} x2={model.heightDim.x + 5} y2={model.heightDim.y2} />
      </g>
      <text x={model.heightDim.x + 9} y={(model.heightDim.y1 + model.heightDim.y2) / 2} fontSize="11" fill={INK} dominantBaseline="middle">
        {cfg.height}
      </text>
      {/* total developed length */}
      <g stroke={STONE} strokeWidth="1" fill="none">
        <line x1={model.totalDim.x1} y1={model.totalDim.y} x2={model.totalDim.x2} y2={model.totalDim.y} />
        <line x1={model.totalDim.x1} y1={model.totalDim.y - 5} x2={model.totalDim.x1} y2={model.totalDim.y + 5} />
        <line x1={model.totalDim.x2} y1={model.totalDim.y - 5} x2={model.totalDim.x2} y2={model.totalDim.y + 5} />
      </g>
      <text x={(model.totalDim.x1 + model.totalDim.x2) / 2} y={model.totalDim.y + 16} fontSize="11" fill={INK} textAnchor="middle">
        Σ {derived.totalLength} mm
      </text>

      {/* plan view */}
      {model.plan.map((p, i) => (
        <g key={i}>
          <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={INK} strokeWidth={p.stair ? 1.6 : 2.6} strokeDasharray={p.stair ? "7 4" : undefined} />
          <circle cx={p.x1} cy={p.y1} r="3" fill={INK} />
          {i === model.plan.length - 1 && <circle cx={p.x2} cy={p.y2} r="3" fill={INK} />}
          <text x={(p.x1 + p.x2) / 2 + 8} y={(p.y1 + p.y2) / 2 - 8} fontSize="11" fill={INK}>
            {p.len}{p.stair ? ` / ${p.slope}°` : ""}
          </text>
          {i > 0 && (
            <text x={p.x1 + 10} y={p.y1 + 18} fontSize="10" fill={STONE}>
              {p.angle > 0 ? "+" : ""}{p.angle}°
            </text>
          )}
        </g>
      ))}

      {/* non-binding watermark: diagonal across the sheet + title-block line */}
      <text
        x={W / 2}
        y={310}
        fontSize="19"
        letterSpacing="4"
        fill="#b04a3a"
        fillOpacity="0.33"
        textAnchor="middle"
        transform={`rotate(-13 ${W / 2} 310)`}
      >
        {labels.watermark}
      </text>

      {/* title block */}
      <g>
        <line x1="34" y1={H - 96} x2={W - 34} y2={H - 96} stroke={INK} strokeWidth="1.2" />
        <text x="34" y={H - 20} fontSize="9.5" fill="#b04a3a">
          {labels.watermark}
        </text>
        <text x="34" y={H - 68} fontSize="16" letterSpacing="4" fill={INK} fontWeight="600">
          AXIO<tspan fontWeight="300">FORM</tspan>
        </text>
        <text x="34" y={H - 46} fontSize="11" fill={STONE}>
          {labels.title} · {labels.scale}
        </text>
        <text x="380" y={H - 68} fontSize="11" fill={STONE}>{labels.project}</text>
        <text x="380" y={H - 50} fontSize="12" fill={INK}>{refNo}</text>
        <text x="560" y={H - 68} fontSize="11" fill={STONE}>{labels.date}</text>
        <text x="560" y={H - 50} fontSize="12" fill={INK}>{date}</text>
        <text x="700" y={H - 68} fontSize="11" fill={STONE}>{labels.config}</text>
        <text x="700" y={H - 50} fontSize="12" fill={INK}>
          H {cfg.height} ·{" "}
          {derived.panelCount > 0
            ? `${derived.panelCount} ${cfg.system === "glass" ? "VSG" : "EL"}`
            : derived.railCount > 0
              ? `${derived.postCount}P · ${derived.railCount}Q`
              : `${derived.postCount}P · ${derived.barCount}S`}
        </text>
        <text x="380" y={H - 30} fontSize="10" fill={STONE}>
          {labels.rules}: {SIA_RULES_VERSION} · {PRICEBOOK_VERSION}
        </text>
      </g>
    </svg>
  );
});

export default DrawingSVG;
