"use client";

/*
 * Visual configurator aids: plan sketch with colour-coded segments, shape
 * presets, and illustrated option cards (walls, substrate, finish, infill).
 * Pure presentation — all data flows through the existing RailingConfig.
 */

import type { Finish, RailingConfig, SegmentInput, Substrate, WallEnds, InfillKind } from "@/lib/engine/types";
import { newSegment } from "@/lib/engine/types";

/** Muted per-segment colours (plan sketch ↔ length inputs), à la "Länge Blau/Gelb/Grün". */
export const SEGMENT_COLORS = ["#4d6172", "#a8823c", "#5d7d5f", "#8a5d7d", "#5d6d8a", "#7d6a5d"];

export const segColor = (i: number) => SEGMENT_COLORS[i % SEGMENT_COLORS.length];

/* ---------- shape presets ---------- */

export type ShapeKind = "i" | "l_in" | "l_out" | "u" | "custom";

export function shapeOf(segments: SegmentInput[]): ShapeKind {
  const a = segments.map((s) => s.angle);
  if (segments.length === 1) return "i";
  if (segments.length === 2 && a[1] === 90) return "l_in";
  if (segments.length === 2 && a[1] === -90) return "l_out";
  if (segments.length === 3 && a[1] === 90 && a[2] === 90) return "u";
  return "custom";
}

/** Seed segments for a preset, keeping the first segment's length where sensible. */
export function shapeSegments(kind: ShapeKind, current: SegmentInput[]): SegmentInput[] {
  const keep = (i: number, fallback: number) => current[i]?.length ?? fallback;
  switch (kind) {
    case "i":
      return [newSegment({ length: keep(0, 4000), angle: 0 })];
    case "l_in":
      return [newSegment({ length: keep(0, 3000) }), newSegment({ length: keep(1, 2000), angle: 90 })];
    case "l_out":
      return [newSegment({ length: keep(0, 3000) }), newSegment({ length: keep(1, 2000), angle: -90 })];
    case "u":
      return [
        newSegment({ length: keep(0, 2000) }),
        newSegment({ length: keep(1, 3000), angle: 90 }),
        newSegment({ length: keep(2, 2000), angle: 90 }),
      ];
    default:
      return current;
  }
}

/** Mini plan glyphs for the shape preset tiles. */
export function ShapeGlyph({ kind, active }: { kind: ShapeKind; active: boolean }) {
  const stroke = active ? "currentColor" : "#8b8b84";
  const paths: Record<ShapeKind, string> = {
    i: "M8 22 H56",
    l_in: "M8 10 H44 V34",
    l_out: "M8 34 H44 V10",
    u: "M10 8 V34 H54 V8",
    custom: "M8 30 L22 30 L34 16 L48 24 L56 12",
  };
  return (
    <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
      <path d={paths[kind]} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <circle cx={kind === "u" ? 10 : 8} cy={kind === "i" ? 22 : kind === "l_in" ? 10 : kind === "l_out" ? 34 : kind === "u" ? 8 : 30} r="2.6" fill={stroke} />
    </svg>
  );
}

/* ---------- plan sketch ---------- */

interface Pt {
  x: number;
  y: number;
}

/** Colour-coded plan view of the configured run, incl. wall connections. */
export function PlanSketch({ cfg }: { cfg: RailingConfig }) {
  // Walk the plan polyline.
  const pts: Pt[] = [{ x: 0, y: 0 }];
  let heading = 0;
  cfg.segments.forEach((s, i) => {
    if (i > 0) heading += s.angle;
    const rad = (heading * Math.PI) / 180;
    const prev = pts[pts.length - 1];
    pts.push({ x: prev.x + Math.cos(rad) * s.length, y: prev.y + Math.sin(rad) * s.length });
  });

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const S = 100 / span; // model → sketch units
  const PAD = 16;
  const W = (maxX - minX) * S + PAD * 2;
  const H = (maxY - minY) * S + PAD * 2;
  const map = (p: Pt): Pt => ({ x: (p.x - minX) * S + PAD, y: (p.y - minY) * S + PAD });

  const walls = cfg.walls ?? "none";

  /** Hatched wall block perpendicular to a segment end. */
  const wallBlock = (at: Pt, segIndex: number, end: "start" | "end") => {
    let h = 0;
    cfg.segments.forEach((s, i) => {
      if (i > 0 && i <= segIndex) h += s.angle;
    });
    const rad = (h * Math.PI) / 180;
    // Perpendicular direction of the wall face.
    const px = -Math.sin(rad);
    const py = Math.cos(rad);
    const dx = Math.cos(rad) * (end === "start" ? -1 : 1);
    const dy = Math.sin(rad) * (end === "start" ? -1 : 1);
    const c = map(at);
    const t = 3.2; // wall thickness (sketch units)
    const l = 11; // wall face half-length
    const cx = c.x + dx * (t / 2 + 1.2);
    const cy = c.y + dy * (t / 2 + 1.2);
    return (
      <g key={`w-${end}`}>
        <line x1={cx - px * l} y1={cy - py * l} x2={cx + px * l} y2={cy + py * l} stroke="#8b8b84" strokeWidth={t} />
        {[-0.66, -0.22, 0.22, 0.66].map((f, k) => (
          <line
            key={k}
            x1={cx + px * l * f - dx * 1.4 - px * 2}
            y1={cy + py * l * f - dy * 1.4 - py * 2}
            x2={cx + px * l * f + dx * 1.4 + px * 2}
            y2={cy + py * l * f + dy * 1.4 + py * 2}
            stroke="#c9c7bf"
            strokeWidth="0.9"
          />
        ))}
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[380px]" aria-hidden>
      {cfg.segments.map((s, i) => {
        const a = map(pts[i]);
        const b = map(pts[i + 1]);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // Label offset: perpendicular, away from the polyline's centroid.
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const nl = Math.hypot(nx, ny) || 1;
        const cxAll = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
        const cyAll = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
        const cm = map({ x: cxAll, y: cyAll });
        const sign = (mid.x - cm.x) * (nx / nl) + (mid.y - cm.y) * (ny / nl) >= 0 ? 1 : -1;
        const lx = mid.x + (nx / nl) * 8.5 * sign;
        const ly = mid.y + (ny / nl) * 8.5 * sign;
        return (
          <g key={s.id}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={segColor(i)}
              strokeWidth="3.4"
              strokeLinecap="butt"
              strokeDasharray={s.stair ? "6 3" : undefined}
            />
            <text x={lx} y={ly} fontSize="6.4" fill={segColor(i)} textAnchor="middle" dominantBaseline="middle" fontWeight="500">
              {(s.length / 1000).toLocaleString("de-CH", { maximumFractionDigits: 2 })} m{s.stair ? ` · ${s.slope}°` : ""}
            </text>
          </g>
        );
      })}
      {pts.map((p, i) => {
        const c = map(p);
        return <circle key={i} cx={c.x} cy={c.y} r="2" fill="#45453f" />;
      })}
      {(walls === "start" || walls === "both") && wallBlock(pts[0], 0, "start")}
      {(walls === "end" || walls === "both") && wallBlock(pts[pts.length - 1], cfg.segments.length - 1, "end")}
    </svg>
  );
}

/* ---------- illustrated option cards ---------- */

export function IconCards<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 3,
}: {
  label: string;
  value: T;
  options: { v: T; l: string; icon: React.ReactNode }[];
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
}) {
  const grid = columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4";
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">{label}</span>
      <div className={`grid gap-2 ${grid}`}>
        {options.map((o) => {
          const selected = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(o.v)}
              className={`flex flex-col items-center gap-1.5 border px-2 py-3 transition-colors ${
                selected ? "border-ink bg-mist/70 text-ink" : "border-hairline text-graphite hover:border-graphite"
              }`}
            >
              {o.icon}
              <span className="text-center text-[11px] font-light leading-tight">{o.l}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- icons: wall situation ---------- */

export function WallIcon({ kind }: { kind: WallEnds }) {
  const wall = (x: number) => (
    <g>
      <rect x={x} y={6} width={7} height={32} fill="#d8d6cf" stroke="#8b8b84" strokeWidth="1" />
      {[12, 20, 28].map((y) => (
        <line key={y} x1={x + 1} y1={y + 4} x2={x + 6} y2={y - 2} stroke="#a9a79e" strokeWidth="1" />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
      <line x1={kind === "start" || kind === "both" ? 15 : 8} y1={22} x2={kind === "end" || kind === "both" ? 49 : 56} y2={22} stroke="currentColor" strokeWidth="2.6" />
      {[0, 1, 2, 3].map((i) => {
        const x0 = kind === "start" || kind === "both" ? 15 : 8;
        const x1 = kind === "end" || kind === "both" ? 49 : 56;
        const x = x0 + ((x1 - x0) / 3) * i;
        return <line key={i} x1={x} y1={22} x2={x} y2={36} stroke="currentColor" strokeWidth="1.6" />;
      })}
      {(kind === "start" || kind === "both") && wall(6)}
      {(kind === "end" || kind === "both") && wall(51)}
    </svg>
  );
}

/* ---------- icons: substrate / fastening ---------- */

export function SubstrateIcon({ kind }: { kind: Substrate }) {
  const post = (x: number, y0: number, y1: number) => <line x1={x} y1={y0} x2={x} y2={y1} stroke="currentColor" strokeWidth="2.6" />;
  const plate = (x: number, y: number, w = 10) => <line x1={x - w / 2} y1={y} x2={x + w / 2} y2={y} stroke="currentColor" strokeWidth="2" />;
  const concrete = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#e3e1da" stroke="#8b8b84" strokeWidth="1" />
      {[...Array(3)].map((_, i) => (
        <circle key={i} cx={x + 6 + i * (w / 3.2)} cy={y + h / 2 + (i % 2 ? 3 : -2)} r="1" fill="#b3b1a8" />
      ))}
    </g>
  );
  const wood = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#e8dcc8" stroke="#a08a62" strokeWidth="1" />
      {[...Array(3)].map((_, i) => (
        <line key={i} x1={x + 2} y1={y + 4 + i * (h / 3.4)} x2={x + w - 2} y2={y + 3 + i * (h / 3.4)} stroke="#c9b58e" strokeWidth="1" />
      ))}
    </g>
  );
  const stone = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#dcdcd8" stroke="#8b8b84" strokeWidth="1" />
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h / 2} stroke="#a9a79e" strokeWidth="1" />
      <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke="#a9a79e" strokeWidth="1" />
      <line x1={x + w / 4} y1={y + h / 2} x2={x + w / 4} y2={y + h} stroke="#a9a79e" strokeWidth="1" />
    </g>
  );

  switch (kind) {
    case "concrete_top":
      return (
        <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
          {concrete(10, 26, 44, 12)}
          {post(32, 8, 26)}
          {plate(32, 26)}
        </svg>
      );
    case "concrete_side":
      return (
        <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
          {concrete(10, 26, 44, 12)}
          {post(24, 6, 32)}
          <line x1={24} y1={30} x2={12} y2={30} stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "concrete_side_offset":
      return (
        <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
          {concrete(16, 26, 40, 12)}
          {post(8, 6, 34)}
          <line x1={8} y1={29} x2={18} y2={29} stroke="currentColor" strokeWidth="2" />
          <line x1={8} y1={34} x2={18} y2={34} stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "concrete_parapet":
      return (
        <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
          {concrete(26, 12, 13, 28)}
          {post(18, 4, 30)}
          <line x1={18} y1={16} x2={27} y2={16} stroke="currentColor" strokeWidth="2" />
          <line x1={18} y1={26} x2={27} y2={26} stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "wood_side":
      return (
        <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
          {wood(14, 26, 42, 12)}
          {post(22, 6, 32)}
          <line x1={22} y1={30} x2={15} y2={30} stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "stone_top":
      return (
        <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
          {stone(12, 24, 40, 15)}
          {post(32, 6, 24)}
          {plate(32, 24)}
        </svg>
      );
  }
}

/* ---------- icons: finish ---------- */

export function FinishIcon({ kind, ral }: { kind: Finish; ral: string }) {
  if (kind === "galvanized") {
    return (
      <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
        <rect x={12} y={8} width={40} height={28} fill="#c3c8cb" stroke="#8b8b84" strokeWidth="1" />
        {[
          [18, 14, 26, 20],
          [30, 12, 40, 17],
          [22, 24, 33, 30],
          [38, 22, 47, 29],
          [16, 28, 22, 33],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e8ebed" strokeWidth="1.4" />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
      <rect x={12} y={8} width={40} height={28} fill={ral} stroke="#8b8b84" strokeWidth="1" />
      <rect x={16} y={12} width={12} height={5} fill="#ffffff" opacity="0.25" />
    </svg>
  );
}

/* ---------- icons: infill kind (type tiles) ---------- */

export function InfillIcon({ kind }: { kind: InfillKind }) {
  const frame = (
    <>
      <line x1={6} y1={8} x2={58} y2={8} stroke="currentColor" strokeWidth="2.6" />
      <line x1={10} y1={8} x2={10} y2={38} stroke="currentColor" strokeWidth="2" />
      <line x1={54} y1={8} x2={54} y2={38} stroke="currentColor" strokeWidth="2" />
    </>
  );
  return (
    <svg viewBox="0 0 64 44" className="h-9 w-14" aria-hidden>
      {frame}
      {kind === "vertical_bars" &&
        [17, 24, 31, 38, 47].map((x) => <line key={x} x1={x} y1={12} x2={x} y2={38} stroke="currentColor" strokeWidth="1.4" />)}
      {kind === "vertical_flats" &&
        [18, 27, 36, 45].map((x) => <line key={x} x1={x} y1={12} x2={x} y2={38} stroke="currentColor" strokeWidth="3.2" />)}
      {kind === "horizontal_rails" &&
        [15, 21, 27, 33].map((y) => <line key={y} x1={10} y1={y} x2={54} y2={y} stroke="currentColor" strokeWidth="1.4" />)}
      {kind === "cables" &&
        [14, 19, 24, 29, 34].map((y) => <line key={y} x1={10} y1={y} x2={54} y2={y} stroke="currentColor" strokeWidth="0.8" />)}
      {kind === "glass" && <rect x={14} y={12} width={36} height={26} fill="#a9c0cc" opacity="0.45" stroke="currentColor" strokeWidth="0.8" />}
      {kind === "sheet" && <rect x={14} y={12} width={36} height={26} fill="currentColor" opacity="0.28" />}
    </svg>
  );
}
