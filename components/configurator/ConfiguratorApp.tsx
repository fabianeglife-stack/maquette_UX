"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import DrawingSVG from "./DrawingSVG";
import { downloadDrawingPdf } from "./pdf";
import { deriveRailing } from "@/lib/engine/geometry";
import { evaluateSia, siaSummary, type RuleStatus } from "@/lib/engine/sia";
import { chf, priceRailing } from "@/lib/engine/pricing";
import { defaultConfig, newSegment, type RailingConfig } from "@/lib/engine/types";
import type { Dict } from "@/lib/i18n";

const Scene3D = dynamic(() => import("./Scene3D"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.2em] text-stone">3D …</div>,
});

type CfgDict = Dict["cfg"];

const STORAGE_KEY = "axioform-config-v1";

function fmt(tpl: string, params: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
}

const STATUS_COLOR: Record<RuleStatus, string> = {
  pass: "#4a7c59",
  warn: "#b9882f",
  fail: "#b04a3a",
};

/* ---------- small form primitives ---------- */

function Num({
  label,
  value,
  onChange,
  min,
  max,
  step = 10,
  unit = "mm",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{label}</span>
      <span className="flex items-center border border-hairline bg-paper focus-within:border-graphite">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-full bg-transparent px-3 py-2 text-sm font-light text-ink outline-none"
        />
        <span className="pr-3 text-xs text-stone">{unit}</span>
      </span>
    </label>
  );
}

function Pills<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`border px-3.5 py-2 text-xs tracking-[0.06em] transition-colors ${
              value === o.v ? "border-ink bg-ink text-paper" : "border-hairline text-graphite hover:border-graphite"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- main app ---------- */

export default function ConfiguratorApp({ t }: { t: CfgDict }) {
  const [cfg, setCfg] = useState<RailingConfig>(defaultConfig);
  const [tab, setTab] = useState<"3d" | "drawing">("3d");
  const [panel, setPanel] = useState<{ kind: "order" | "quote"; ref: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const refNo = useMemo(() => "AX-" + Date.now().toString(36).toUpperCase().slice(-6), []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCfg({ ...defaultConfig(), ...(JSON.parse(raw) as RailingConfig) });
    } catch {
      /* corrupted storage — start fresh */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }, [cfg, loaded]);

  const derived = useMemo(() => deriveRailing(cfg), [cfg]);
  const sia = useMemo(() => evaluateSia(cfg, derived), [cfg, derived]);
  const overall = siaSummary(sia);
  const price = useMemo(() => priceRailing(cfg, derived), [cfg, derived]);

  const set = (patch: Partial<RailingConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const setSeg = (id: string, patch: Partial<RailingConfig["segments"][number]>) =>
    setCfg((c) => ({ ...c, segments: c.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const ruleText: Record<string, string> = t.rules;
  const lineText: Record<string, string> = t.priceLines;

  return (
    <div className="grid gap-10 lg:grid-cols-[420px_1fr]">
      {/* ---------- left: steps ---------- */}
      <div className="flex flex-col gap-10">
        {/* 1 — system */}
        <section className="flex flex-col gap-4">
          <h2 className="flex items-baseline gap-4 border-t border-ink/60 pt-4 text-base font-normal text-ink">
            <span className="text-xs text-stone">01</span>
            {t.stepSystem}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="flex flex-col gap-1 border border-ink bg-ink px-4 py-3 text-left text-paper">
              <span className="text-sm">{t.systemBars}</span>
              <span className="text-[11px] font-light text-paper/60">{t.systemBarsDesc}</span>
            </button>
            <div className="flex cursor-not-allowed flex-col gap-1 border border-hairline px-4 py-3 opacity-60">
              <span className="text-sm text-graphite">{t.systemGlass}</span>
              <span className="text-[11px] font-light text-stone">{t.systemGlassSoon}</span>
            </div>
          </div>
        </section>

        {/* 2 — geometry */}
        <section className="flex flex-col gap-4">
          <h2 className="flex items-baseline gap-4 border-t border-ink/60 pt-4 text-base font-normal text-ink">
            <span className="text-xs text-stone">02</span>
            {t.stepGeometry}
          </h2>

          {cfg.segments.map((seg, i) => (
            <div key={seg.id} className="flex flex-col gap-3 border border-hairline p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">
                  {t.segment} {i + 1}
                </span>
                {cfg.segments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCfg((c) => ({ ...c, segments: c.segments.filter((s) => s.id !== seg.id) }))}
                    className="text-[11px] uppercase tracking-[0.12em] text-stone underline-offset-2 hover:text-ink hover:underline"
                  >
                    {t.remove}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Num label={t.length} value={seg.length} min={250} max={12000} step={50} onChange={(v) => setSeg(seg.id, { length: v })} />
                {i > 0 ? (
                  <Num label={t.angle} value={seg.angle} min={-135} max={135} step={5} unit="°" onChange={(v) => setSeg(seg.id, { angle: v })} />
                ) : (
                  <div />
                )}
              </div>
              <div className="flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-light text-graphite">
                  <input
                    type="checkbox"
                    checked={seg.stair}
                    onChange={(e) => setSeg(seg.id, { stair: e.target.checked, slope: e.target.checked ? Math.max(seg.slope, 30) : 0 })}
                    className="h-4 w-4 accent-[#171716]"
                  />
                  {t.stair}
                </label>
                {seg.stair && (
                  <div className="flex flex-1 items-center gap-3">
                    <input
                      type="range"
                      min={10}
                      max={45}
                      step={1}
                      value={seg.slope}
                      onChange={(e) => setSeg(seg.id, { slope: Number(e.target.value) })}
                      className="flex-1 accent-[#171716]"
                    />
                    <span className="w-10 text-right text-sm font-light text-ink">{seg.slope}°</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setCfg((c) => ({ ...c, segments: [...c.segments, newSegment({ angle: 90 })] }))}
            className="self-start border border-ink/25 px-4 py-2.5 text-xs uppercase tracking-[0.14em] text-ink transition-colors hover:border-ink"
          >
            + {t.addSegment}
          </button>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Num label={t.height} value={cfg.height} min={800} max={1400} onChange={(v) => set({ height: v })} />
            <Num label={t.bottomGap} value={cfg.bottomGap} min={20} max={200} onChange={(v) => set({ bottomGap: v })} />
            <Num label={t.barClear} value={cfg.barClear} min={60} max={160} step={5} onChange={(v) => set({ barClear: v })} />
            <Num label={t.fallHeight} value={cfg.fallHeightM} min={1} max={30} step={1} unit="m" onChange={(v) => set({ fallHeightM: v })} />
          </div>
        </section>

        {/* 3 — options */}
        <section className="flex flex-col gap-5">
          <h2 className="flex items-baseline gap-4 border-t border-ink/60 pt-4 text-base font-normal text-ink">
            <span className="text-xs text-stone">03</span>
            {t.stepOptions}
          </h2>
          <Pills
            label={t.mounting}
            value={cfg.mounting}
            options={[
              { v: "top", l: t.mountingTop },
              { v: "side", l: t.mountingSide },
            ]}
            onChange={(v) => set({ mounting: v })}
          />
          <Pills
            label={t.handrail}
            value={cfg.handrail}
            options={[
              { v: "round_steel", l: t.hrRound },
              { v: "flat_steel", l: t.hrFlat },
              { v: "round_inox", l: t.hrInox },
            ]}
            onChange={(v) => set({ handrail: v })}
          />
          <Pills
            label={t.color}
            value={cfg.color}
            options={[
              { v: "ral7016", l: t.colors.ral7016 },
              { v: "ral9005", l: t.colors.ral9005 },
              { v: "ral9010", l: t.colors.ral9010 },
              { v: "custom", l: t.colors.custom },
            ]}
            onChange={(v) => set({ color: v })}
          />
          <Pills
            label={t.usage}
            value={cfg.usage}
            options={[
              { v: "residential", l: t.usageRes },
              { v: "public", l: t.usagePub },
            ]}
            onChange={(v) => set({ usage: v })}
          />
        </section>

        {/* 4 — SIA + price */}
        <section className="flex flex-col gap-5">
          <h2 className="flex items-baseline gap-4 border-t border-ink/60 pt-4 text-base font-normal text-ink">
            <span className="text-xs text-stone">04</span>
            {t.stepSummary}
          </h2>

          <div className="flex flex-col gap-2.5 border border-hairline p-4">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">{t.siaTitle}</span>
            {sia.map((r) => (
              <div key={r.id} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[r.status] }} />
                <p className="text-[13px] font-light leading-snug text-graphite">
                  {fmt(ruleText[r.id] ?? r.id, r.params)}
                  <span className="text-stone"> · {r.ref}</span>
                </p>
              </div>
            ))}
            <p className="pt-1 text-[11px] font-light leading-relaxed text-stone">{t.disclaimer}</p>
          </div>

          <div className="flex flex-col border border-hairline p-4">
            <span className="pb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">{t.priceTitle}</span>
            {price.lines.map((l) => (
              <div key={l.id} className="flex items-baseline justify-between gap-3 border-t border-hairline/70 py-1.5 first:border-t-0">
                <span className="text-[13px] font-light text-graphite">
                  {fmt(lineText[l.id] ?? l.id, l.params)}
                  {l.unit !== "flat" && <span className="text-stone"> · {l.qty} {l.unit === "m" ? "m" : "×"}</span>}
                </span>
                <span className="whitespace-nowrap text-[13px] font-light text-ink">{chf(l.total)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-ink/50 pt-2 text-[13px] text-graphite">
              <span>{t.vat}</span>
              <span>{chf(price.vat)}</span>
            </div>
            <div className="flex items-baseline justify-between pt-1.5">
              <span className="text-sm text-ink">{t.gross}</span>
              <span className="text-xl font-light tracking-tight text-ink">{chf(price.gross)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={overall === "fail"}
                onClick={() => setPanel({ kind: "order", ref: refNo })}
                className="inline-flex items-center justify-center bg-ink px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.buy}
              </button>
              <button
                type="button"
                onClick={() => setPanel({ kind: "quote", ref: refNo })}
                className="inline-flex items-center justify-center border border-ink/25 px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-ink transition-colors hover:border-ink"
              >
                {t.quote}
              </button>
              <button
                type="button"
                onClick={() => svgRef.current && downloadDrawingPdf(svgRef.current, `axioform-${refNo}.pdf`)}
                className="inline-flex items-center justify-center border border-ink/25 px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-ink transition-colors hover:border-ink"
              >
                ↓ {t.downloadPdf}
              </button>
            </div>
            {overall === "fail" && <p className="text-xs font-light text-[#b04a3a]">{t.buyBlocked}</p>}
            {panel && (
              <div role="status" className="flex flex-col gap-1.5 border-l-2 border-steel bg-mist/70 p-4">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-steel">
                  {panel.kind === "order" ? t.orderTitle : t.quoteTitle}
                </span>
                <p className="text-sm font-light leading-relaxed text-graphite">
                  {fmt(panel.kind === "order" ? t.orderText : t.quoteText, { ref: panel.ref })}
                </p>
              </div>
            )}
            <p className="text-[11px] font-light text-stone">{t.saved}</p>
          </div>
        </section>
      </div>

      {/* ---------- right: viewport ---------- */}
      <div className="flex flex-col gap-4 self-start lg:sticky lg:top-24">
        <div className="flex items-center justify-between">
          <div className="flex gap-px bg-hairline">
            {(
              [
                { v: "3d", l: t.tab3d },
                { v: "drawing", l: t.tabDrawing },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setTab(o.v)}
                className={`px-5 py-2.5 text-xs uppercase tracking-[0.14em] transition-colors ${
                  tab === o.v ? "bg-ink text-paper" : "bg-paper text-graphite hover:text-ink"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <span
            className="border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em]"
            style={{ color: STATUS_COLOR[overall], borderColor: STATUS_COLOR[overall] }}
          >
            {t.siaBadge[overall]}
          </span>
        </div>

        <div className={`h-[380px] overflow-hidden border border-hairline md:h-[520px] ${tab === "3d" ? "" : "hidden"}`}>
          <Scene3D cfg={cfg} derived={derived} />
        </div>
        <div className={`border border-hairline ${tab === "drawing" ? "" : "hidden"}`}>
          <DrawingSVG ref={svgRef} cfg={cfg} derived={derived} labels={t.drawing} refNo={refNo} />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-ink/50 pt-4">
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <span className="text-[13px] font-light text-graphite">
              {t.stats.length} <span className="text-ink">{(derived.totalLength / 1000).toLocaleString("de-CH")} m</span>
            </span>
            <span className="text-[13px] font-light text-graphite">
              {t.stats.posts} <span className="text-ink">{derived.postCount}</span>
            </span>
            <span className="text-[13px] font-light text-graphite">
              {t.stats.bars} <span className="text-ink">{derived.barCount}</span>
            </span>
            <span className="text-[13px] font-light text-graphite">
              {t.stats.weight} <span className="text-ink">{derived.weightKg} kg</span>
            </span>
          </div>
          <span className="text-2xl font-light tracking-tight text-ink">{chf(price.gross)}</span>
        </div>
      </div>
    </div>
  );
}
