"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import DrawingSVG from "./DrawingSVG";
import { downloadDrawingPdf } from "./pdf";
import { deriveRailing } from "@/lib/engine/geometry";
import { evaluateSia, siaSummary, type RuleStatus } from "@/lib/engine/sia";
import { chf, defaultPriceBook, priceRailing, type PriceBook } from "@/lib/engine/pricing";
import {
  builtinTypes,
  defaultConfig,
  infillKindOf,
  newSegment,
  normalizeForType,
  SUBSTRATE_MOUNTING,
  type RailingConfig,
  type Substrate,
  type TypeProfile,
} from "@/lib/engine/types";
import {
  decodeConfig,
  encodeConfig,
  getSession,
  newRef,
  saveOrder,
  planFor,
  TIER_DISCOUNT,
  tierFor,
  type Order,
  type TypePlans,
} from "@/lib/store";
import { addSavedConfig, fetchAllTypes, fetchPageContent, fetchPriceBook } from "@/lib/data";
import { api, hasBackend } from "@/lib/api";
import {
  FinishIcon,
  IconCards,
  InfillIcon,
  PlanSketch,
  segColor,
  ShapeGlyph,
  shapeOf,
  shapeSegments,
  SubstrateIcon,
  WallIcon,
  type ShapeKind,
} from "./visual";
import type { Dict } from "@/lib/i18n";
import Link from "next/link";

const Scene3D = dynamic(() => import("./Scene3D"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.2em] text-stone">3D …</div>,
});

type CfgDict = Dict["cfg"];

const STORAGE_KEY = "axioform-config-v1";

// Launch mode: everything goes through a reviewed quote — no direct orders.
// Set NEXT_PUBLIC_QUOTE_ONLY=0 to re-enable direct ordering later.
const QUOTE_ONLY = process.env.NEXT_PUBLIC_QUOTE_ONLY !== "0";

const RAL_HEX: Record<RailingConfig["color"], string> = {
  ral7016: "#383e42",
  ral9005: "#0e0e0e",
  ral9010: "#efece3",
  custom: "#4d6172",
};

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

/* ---------- checkout ---------- */

function CheckoutForm({
  t,
  kind,
  summary,
  onSubmit,
  onCancel,
}: {
  t: CfgDict;
  kind: "order" | "quote";
  /** One-line context: what is being requested (type · length · Richtpreis). */
  summary: string;
  onSubmit: (customer: Order["customer"], payment: "card" | "twint" | "invoice") => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [payment, setPayment] = useState<"card" | "twint" | "invoice">("card");

  const inputCls =
    "w-full border border-hairline bg-paper px-3 py-2.5 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, email, street, city }, payment);
      }}
      className="flex flex-col gap-3 border border-ink/60 p-4"
    >
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink">
        {kind === "order" ? t.checkout.orderTitle : t.checkout.quoteTitle}
      </span>
      <p className="border-l-2 border-steel bg-mist/60 px-3 py-2 text-[13px] font-light text-graphite">{summary}</p>
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder={t.checkout.name} value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} col-span-2`} />
        <input required type="email" placeholder={t.checkout.email} value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} col-span-2`} />
        <input required placeholder={t.checkout.street} value={street} onChange={(e) => setStreet(e.target.value)} className={inputCls} />
        <input required placeholder={t.checkout.city} value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
      </div>
      {kind === "order" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.checkout.payment}</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: "card", l: t.checkout.payCard },
                { v: "twint", l: t.checkout.payTwint },
                { v: "invoice", l: t.checkout.payInvoice },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setPayment(o.v)}
                className={`border px-3.5 py-2 text-xs tracking-[0.06em] transition-colors ${
                  payment === o.v ? "border-ink bg-ink text-paper" : "border-hairline text-graphite hover:border-graphite"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          className="inline-flex items-center justify-center bg-ink px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite"
        >
          {kind === "order" ? t.checkout.submitOrder : t.checkout.submitQuote}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center border border-hairline px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite"
        >
          {t.checkout.cancel}
        </button>
      </div>
    </form>
  );
}

/* ---------- main app ---------- */

export default function ConfiguratorApp({ t, locale }: { t: CfgDict; locale: string }) {
  // Start from the default type's as-built defaults (height, bottom gap).
  const [cfg, setCfg] = useState<RailingConfig>(() => normalizeForType(defaultConfig(), builtinTypes[0]));
  const [tab, setTab] = useState<"3d" | "drawing">("3d");
  const [checkout, setCheckout] = useState<"order" | "quote" | null>(null);
  const [panel, setPanel] = useState<{ kind: "order" | "quote"; ref: string } | null>(null);
  const [pb, setPb] = useState<PriceBook>(defaultPriceBook);
  const [types, setTypes] = useState<TypeProfile[]>(builtinTypes);
  const [typePlans, setTypePlans] = useState<TypePlans>({});
  const [loaded, setLoaded] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [discount, setDiscount] = useState(0);
  const [shareMsg, setShareMsg] = useState<"saved" | "copied" | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const refNo = useMemo(() => "AX-" + Date.now().toString(36).toUpperCase().slice(-6), []);

  useEffect(() => {
    // A `?c=` share link wins over the locally persisted configuration.
    const shared = new URLSearchParams(window.location.search).get("c");
    const fromLink = shared ? decodeConfig(shared) : null;
    if (fromLink) {
      setCfg({ ...defaultConfig(), ...fromLink });
    } else {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setCfg({ ...defaultConfig(), ...(JSON.parse(raw) as RailingConfig) });
      } catch {
        /* corrupted storage — start fresh */
      }
    }
    fetchPriceBook().then(setPb);
    fetchAllTypes().then(setTypes);
    fetchPageContent<TypePlans>("typeplans", {}).then(setTypePlans);
    if (hasBackend) {
      api.me().then((u) => setDiscount(TIER_DISCOUNT[u?.tier ?? "standard"])).catch(() => {});
    } else {
      setDiscount(TIER_DISCOUNT[tierFor(getSession()?.email)]);
    }
    setLoaded(true);
  }, []);

  const copyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?c=${encodeConfig(cfg)}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setShareMsg("copied");
  };

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }, [cfg, loaded]);

  const tp = useMemo(
    () => types.find((t) => t.id === (cfg.typeId ?? cfg.system)) ?? types.find((t) => t.id === cfg.system) ?? types[0],
    [types, cfg.typeId, cfg.system],
  );
  const derived = useMemo(() => deriveRailing(cfg, tp), [cfg, tp]);
  const shape = shapeOf(cfg.segments);


  // Desktop step rail: highlight the section in view.
  const [activeStep, setActiveStep] = useState(1);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActiveStep(Number((e.target as HTMLElement).dataset.step))),
      { rootMargin: "-25% 0px -65% 0px" },
    );
    ["step-1", "step-2", "step-3", "cta"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);
  const sia = useMemo(() => evaluateSia(cfg, derived, tp), [cfg, derived, tp]);
  const overall = siaSummary(sia);
  const price = useMemo(() => priceRailing(cfg, derived, pb, tp, discount), [cfg, derived, pb, tp, discount]);

  // Brief highlight on the Richtpreis whenever the total changes.
  const [pulse, setPulse] = useState(false);
  const firstPrice = useRef(true);
  useEffect(() => {
    if (firstPrice.current) {
      firstPrice.current = false;
      return;
    }
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 700);
    return () => clearTimeout(id);
  }, [price.gross]);
  const pulseCls = pulse ? "bg-mist" : "bg-transparent";

  const infillKind = infillKindOf(tp);

  const set = (patch: Partial<RailingConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const setSeg = (id: string, patch: Partial<RailingConfig["segments"][number]>) =>
    setCfg((c) => ({ ...c, segments: c.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const ruleText: Record<string, string> = t.rules;
  const lineText: Record<string, string> = t.priceLines;

  return (
    <div className="grid gap-10 pb-16 lg:grid-cols-[420px_1fr] lg:pb-0">
      {/* ---------- mobile: sticky summary bar ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-hairline bg-paper/95 px-5 py-3 backdrop-blur lg:hidden">
        <div className="flex flex-col">
          <span className="text-lg font-light tracking-tight text-ink">{chf(price.gross)}</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: STATUS_COLOR[overall] }}>
            {t.siaBadge[overall]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#preview"
            className="inline-flex items-center justify-center border border-hairline px-3 py-3 text-xs uppercase tracking-[0.14em] text-graphite"
          >
            3D
          </a>
          <a
            href="#cta"
            className="inline-flex items-center justify-center whitespace-nowrap bg-ink px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] text-paper"
          >
            {QUOTE_ONLY ? t.quoteShort : t.buy}
          </a>
        </div>
      </div>

      {/* ---------- left: steps ---------- */}
      <div className="flex flex-col gap-10">
        {/* step rail (desktop): scrollspy over the four sections */}
        <nav className="sticky top-16 z-30 hidden gap-px self-start bg-hairline lg:flex" aria-label="Schritte">
          {[
            { id: "step-1", n: 1, l: t.stepSystem },
            { id: "step-2", n: 2, l: t.stepGeometry },
            { id: "step-3", n: 3, l: t.stepOptions },
            { id: "cta", n: 4, l: t.stepSummary },
          ].map((sStep) => (
            <a
              key={sStep.id}
              href={`#${sStep.id}`}
              className={`px-3 py-2 text-[10px] uppercase tracking-[0.12em] transition-colors ${
                activeStep === sStep.n ? "bg-ink text-paper" : "bg-paper text-graphite hover:text-ink"
              }`}
            >
              0{sStep.n} {sStep.l}
            </a>
          ))}
        </nav>

        {/* 1 — system */}
        <section id="step-1" data-step="1" className="flex scroll-mt-28 flex-col gap-4">
          <h2 className="flex items-baseline gap-4 border-t border-ink/60 pt-4 text-base font-normal text-ink">
            <span className="text-xs text-stone">01</span>
            {t.stepSystem}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {types
              .filter((x) => x.active)
              .map((x) => {
                const name =
                  x.name?.[locale as "de" | "fr" | "en"] ??
                  x.name?.de ??
                  (x.builtin ? (x.template === "bars" ? t.systemBars : t.systemGlass) : x.id);
                const infillLabel = x.recipe
                  ? x.recipe.infill.kind === "vertical_flats"
                    ? `${t.infillKinds.vertical_flats} ${x.recipe.infill.angleDeg ? `${x.recipe.infill.angleDeg}°` : t.infillStraight}`
                    : t.infillKinds[x.recipe.infill.kind]
                  : "";
                const desc = x.recipe
                  ? `${infillLabel}${x.basePerM ? ` · CHF ${x.basePerM}/m` : ""}`
                  : x.builtin
                    ? x.template === "bars"
                      ? t.systemBarsDesc
                      : t.systemGlassDesc
                    : x.template === "bars"
                      ? `Ø ${x.barDia} mm · ≤ ${x.maxSlope}°${x.basePerM ? ` · CHF ${x.basePerM}/m` : ""}`
                      : `VSG · ≤ ${x.maxPanelWidth} mm${x.basePerM ? ` · CHF ${x.basePerM}/m` : ""}`;
                const selected = tp.id === x.id;
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setCfg((c) => normalizeForType(c, x))}
                    className={`flex items-start gap-3 border px-3.5 py-3 text-left transition-colors ${
                      selected ? "border-ink bg-ink text-paper" : "border-hairline hover:border-graphite"
                    }`}
                  >
                    <span className={`shrink-0 pt-0.5 ${selected ? "text-paper/80" : "text-stone"}`}>
                      <InfillIcon kind={infillKindOf(x)} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={`hyphens-auto break-words text-sm leading-snug ${selected ? "" : "text-graphite"}`}>{name}</span>
                      <span className={`text-[11px] font-light leading-snug ${selected ? "text-paper/60" : "text-stone"}`}>{desc}</span>
                    </span>
                  </button>
                );
              })}
          </div>
          {(() => {
            // Principle plan for the selected type AND fixing situation:
            // admin-uploaded plan wins, the type's built-in PDF is the fallback.
            const mounting = SUBSTRATE_MOUNTING[cfg.substrate ?? "concrete_top"];
            const plan = planFor(typePlans, tp.id, mounting, tp.planUrl);
            if (!plan) return null;
            const uploaded = plan.startsWith("data:");
            return (
              <a
                href={uploaded ? plan : `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${plan}`}
                {...(uploaded
                  ? { download: `axioform-plan-${tp.id}-${mounting}.pdf` }
                  : { target: "_blank", rel: "noopener" })}
                className="inline-flex w-fit items-center gap-2 border border-hairline px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite hover:text-ink"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M8 1v9M4.5 6.5 8 10l3.5-3.5M2 13h12" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                {t.planPdf}
              </a>
            );
          })()}
        </section>

        {/* 2 — geometry */}
        <section id="step-2" data-step="2" className="flex scroll-mt-28 flex-col gap-4">
          <h2 className="flex items-baseline gap-4 border-t border-ink/60 pt-4 text-base font-normal text-ink">
            <span className="text-xs text-stone">02</span>
            {t.stepGeometry}
          </h2>

          {/* base shape presets */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">{t.shape}</span>
            <div className="grid grid-cols-5 gap-2">
              {(["i", "l_in", "l_out", "u", "custom"] as ShapeKind[]).map((k) => {
                const active = shape === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={active}
                    disabled={k === "custom"}
                    onClick={() => setCfg((c) => ({ ...c, segments: shapeSegments(k, c.segments) }))}
                    className={`flex flex-col items-center gap-1 border px-1 py-2.5 transition-colors ${
                      active ? "border-ink bg-mist/70 text-ink" : "border-hairline text-graphite hover:border-graphite"
                    } ${k === "custom" && !active ? "opacity-40" : ""}`}
                  >
                    <ShapeGlyph kind={k} active={active} />
                    <span className="text-[10px] font-light">{t.shapes[k]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* live plan sketch, colour-coded to the segment inputs below */}
          <div className="flex justify-center border border-hairline bg-mist/40 px-6 py-5">
            <PlanSketch cfg={cfg} />
          </div>

          {cfg.segments.map((seg, i) => (
            <div key={seg.id} className="flex flex-col gap-3 border border-hairline p-4" style={{ borderLeft: `3px solid ${segColor(i)}` }}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-graphite">
                  <span className="inline-block h-2.5 w-2.5" style={{ background: segColor(i) }} />
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

          <div className="flex flex-col gap-2 pt-1">
            <IconCards
              label={t.walls}
              value={cfg.walls ?? "none"}
              columns={4}
              options={[
                { v: "none" as const, l: t.wallsNone, icon: <WallIcon kind="none" /> },
                { v: "start" as const, l: t.wallsStart, icon: <WallIcon kind="start" /> },
                { v: "end" as const, l: t.wallsEnd, icon: <WallIcon kind="end" /> },
                { v: "both" as const, l: t.wallsBoth, icon: <WallIcon kind="both" /> },
              ]}
              onChange={(v) => set({ walls: v })}
            />
            {(cfg.walls ?? "none") !== "none" && (
              <p className="text-[11px] font-light leading-relaxed text-stone">{t.wallsNote}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Num label={t.height} value={cfg.height} min={800} max={1400} onChange={(v) => set({ height: v })} />
            <Num label={t.bottomGap} value={cfg.bottomGap} min={20} max={200} onChange={(v) => set({ bottomGap: v })} />
            {infillKind === "vertical_bars" && (
              <Num label={t.barClear} value={cfg.barClear} min={60} max={160} step={5} onChange={(v) => set({ barClear: v })} />
            )}
            <Num label={t.fallHeight} value={cfg.fallHeightM} min={1} max={30} step={1} unit="m" onChange={(v) => set({ fallHeightM: v })} />
          </div>
        </section>

        {/* 3 — options */}
        <section id="step-3" data-step="3" className="flex scroll-mt-28 flex-col gap-5">
          <h2 className="flex items-baseline gap-4 border-t border-ink/60 pt-4 text-base font-normal text-ink">
            <span className="text-xs text-stone">03</span>
            {t.stepOptions}
          </h2>
          <IconCards
            label={t.substrate}
            value={cfg.substrate ?? "concrete_top"}
            columns={3}
            options={(
              [
                "concrete_top",
                "concrete_side",
                "concrete_side_offset",
                "concrete_parapet",
                "wood_side",
                "stone_top",
              ] as Substrate[]
            ).map((v) => ({ v, l: t.substrates[v], icon: <SubstrateIcon kind={v} /> }))}
            onChange={(v) => set({ substrate: v, mounting: SUBSTRATE_MOUNTING[v] })}
          />
          <IconCards
            label={t.finish}
            value={cfg.finish ?? "coated"}
            columns={2}
            options={[
              { v: "coated" as const, l: t.finishCoated, icon: <FinishIcon kind="coated" ral={RAL_HEX[cfg.color]} /> },
              { v: "galvanized" as const, l: t.finishGalvanized, icon: <FinishIcon kind="galvanized" ral="" /> },
            ]}
            onChange={(v) => set({ finish: v })}
          />
          {!tp.recipe && (
            <Pills
              label={t.handrail}
              value={cfg.handrail}
              options={
                cfg.system === "bars"
                  ? [
                      { v: "round_steel" as const, l: t.hrRound },
                      { v: "flat_steel" as const, l: t.hrFlat },
                      { v: "round_inox" as const, l: t.hrInox },
                    ]
                  : [
                      { v: "round_inox" as const, l: t.hrInox },
                      { v: "none" as const, l: t.hrNone },
                    ]
              }
              onChange={(v) => set({ handrail: v })}
            />
          )}
          {infillKind === "glass" && (
            <Pills
              label={t.glassTypeL}
              value={cfg.glassType}
              options={[
                { v: "clear", l: t.glassClear },
                { v: "satin", l: t.glassSatin },
                { v: "tinted", l: t.glassTinted },
              ]}
              onChange={(v) => set({ glassType: v })}
            />
          )}
          {(cfg.finish ?? "coated") === "coated" && (
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
          )}
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
        <section id="cta" data-step="4" className="flex scroll-mt-28 flex-col gap-5">
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
              <span className={`text-xl font-light tracking-tight text-ink transition-colors duration-500 ${pulseCls}`}>{chf(price.gross)}</span>
            </div>
            <p className="pt-1 text-[11px] font-light leading-relaxed text-stone">{t.priceNote}</p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              {!QUOTE_ONLY && (
                <button
                  type="button"
                  disabled={overall === "fail"}
                  onClick={() => {
                    setPanel(null);
                    setCheckout("order");
                  }}
                  className="inline-flex items-center justify-center bg-ink px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t.buy}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPanel(null);
                  setCheckout("quote");
                }}
                className={
                  QUOTE_ONLY
                    ? "inline-flex items-center justify-center bg-ink px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
                    : "inline-flex items-center justify-center border border-ink/25 px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-ink transition-colors hover:border-ink"
                }
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
            {QUOTE_ONLY ? (
              <p className="text-xs font-light text-stone">{t.quoteOnlyNote}</p>
            ) : (
              overall === "fail" && <p className="text-xs font-light text-alert">{t.buyBlocked}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {saveOpen ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addSavedConfig(saveName.trim(), cfg).catch(() => {});
                    setSaveOpen(false);
                    setSaveName("");
                    setShareMsg("saved");
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    required
                    autoFocus
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder={t.share.namePlaceholder}
                    className="border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none placeholder:text-stone focus:border-graphite"
                  />
                  <button type="submit" className="text-xs uppercase tracking-[0.14em] text-ink underline underline-offset-4">
                    {t.share.saveConfirm}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSaveOpen(true);
                    setShareMsg(null);
                  }}
                  className="text-xs uppercase tracking-[0.14em] text-graphite underline-offset-4 hover:text-ink hover:underline"
                >
                  {t.share.save}
                </button>
              )}
              <button
                type="button"
                onClick={copyShareLink}
                className="text-xs uppercase tracking-[0.14em] text-graphite underline-offset-4 hover:text-ink hover:underline"
              >
                {t.share.link}
              </button>
            </div>
            {shareMsg && (
              <p role="status" className="text-xs font-light text-graphite">
                {shareMsg === "saved" ? t.share.savedMsg : t.share.copied}
              </p>
            )}

            {checkout && (
              <CheckoutForm
                t={t}
                kind={checkout}
                summary={`${cfg.system === "glass" ? t.systemGlass : t.systemBars} · ${(derived.totalLength / 1000).toLocaleString("de-CH")} m · ${chf(price.gross)}`}
                onCancel={() => setCheckout(null)}
                onSubmit={(customer, payment) => {
                  if (hasBackend) {
                    // The server recomputes geometry, SIA and price — the
                    // client total is display-only.
                    api
                      .createOrder({ kind: checkout, config: cfg, customer, payment })
                      .then((order) => {
                        setCheckout(null);
                        setPanel({ kind: checkout, ref: order.ref });
                      })
                      .catch(() => setPanel(null));
                    return;
                  }
                  const ref = newRef();
                  const order: Order = {
                    ref,
                    kind: checkout,
                    createdAt: new Date().toISOString().slice(0, 10),
                    status: checkout === "order" ? "new" : "quote_requested",
                    customer,
                    payment: checkout === "order" ? payment : undefined,
                    system: cfg.system,
                    lengthM: Math.round(derived.totalLength / 100) / 10,
                    gross: price.gross,
                    config: cfg,
                  };
                  saveOrder(order);
                  setCheckout(null);
                  setPanel({ kind: checkout, ref });
                }}
              />
            )}

            {panel && (
              <div role="status" className="flex flex-col gap-2 border-l-2 border-steel bg-mist/70 p-4">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-steel">
                  {panel.kind === "order" ? t.orderTitle : t.quoteTitle}
                </span>
                <p className="text-sm font-light leading-relaxed text-graphite">
                  {fmt(panel.kind === "order" ? t.orderText : t.quoteText, { ref: panel.ref })}
                </p>
                <Link
                  href={`/${locale}/portal/`}
                  className="self-start text-xs uppercase tracking-[0.14em] text-ink underline underline-offset-4"
                >
                  {t.checkout.toPortal} →
                </Link>
              </div>
            )}
            <p className="text-[11px] font-light text-stone">{t.saved}</p>
          </div>
        </section>
      </div>

      {/* ---------- right: viewport (first on mobile) ---------- */}
      <div id="preview" className="order-first flex scroll-mt-20 flex-col gap-4 self-start lg:order-none lg:sticky lg:top-24">
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
          <Scene3D cfg={cfg} derived={derived} tp={tp} techLabel={t.scene.technical} />
        </div>
        <div className={`border border-hairline ${tab === "drawing" ? "" : "hidden"}`}>
          <DrawingSVG
            ref={svgRef}
            cfg={cfg}
            derived={derived}
            labels={t.drawing}
            refNo={refNo}
            tp={tp}
            locale={locale}
            typeName={tp.name?.[locale as "de" | "fr" | "en"] ?? tp.name?.de ?? (tp.template === "bars" ? t.systemBars : t.systemGlass)}
          />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-ink/50 pt-4">
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <span className="text-[13px] font-light text-graphite">
              {t.stats.length} <span className="text-ink">{(derived.totalLength / 1000).toLocaleString("de-CH")} m</span>
            </span>
            {derived.postCount > 0 && (
              <span className="text-[13px] font-light text-graphite">
                {t.stats.posts} <span className="text-ink">{derived.postCount}</span>
              </span>
            )}
            {derived.barCount > 0 && (
              <span className="text-[13px] font-light text-graphite">
                {t.stats.bars} <span className="text-ink">{derived.barCount}</span>
              </span>
            )}
            {derived.railCount > 0 && (
              <span className="text-[13px] font-light text-graphite">
                {t.statsRails} <span className="text-ink">{derived.railCount}</span>
              </span>
            )}
            {derived.panelCount > 0 && (
              <span className="text-[13px] font-light text-graphite">
                {t.statsPanels} <span className="text-ink">{derived.panelCount}</span>
              </span>
            )}
            <span className="text-[13px] font-light text-graphite">
              {t.stats.weight} <span className="text-ink">{derived.weightKg} kg</span>
            </span>
          </div>
          <span className={`text-2xl font-light tracking-tight text-ink transition-colors duration-500 ${pulseCls}`}>{chf(price.gross)}</span>
        </div>
      </div>
    </div>
  );
}
