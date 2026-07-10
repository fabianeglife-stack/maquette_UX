"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { deriveRailing } from "@/lib/engine/geometry";
import { evaluateSia, siaSummary, type RuleStatus } from "@/lib/engine/sia";
import { chf, defaultPriceBook, priceRailing } from "@/lib/engine/pricing";
import {
  defaultConfig,
  defaultRecipe,
  normalizeForType,
  type InfillKind,
  type PostProfile,
  type RailProfileKind,
  type TypeProfile,
  type TypeRecipe,
} from "@/lib/engine/types";
import type { Dict } from "@/lib/i18n";

const Scene3D = dynamic(() => import("@/components/configurator/Scene3D"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.2em] text-stone">3D …</div>,
});

const STATUS_COLOR: Record<RuleStatus, string> = { pass: "#4a7c59", warn: "#b9882f", fail: "#b04a3a" };

function Num({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-stone">{label}</span>
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
        className="w-full border border-hairline bg-paper px-2.5 py-1.5 text-sm font-light text-ink outline-none focus:border-graphite"
      />
    </label>
  );
}

function PillRow<T extends string>({
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
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-stone">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`border px-2.5 py-1.5 text-[11px] tracking-[0.04em] transition-colors ${
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

export default function TypeDesigner({
  t,
  cfgDict,
  initial,
  onSave,
  onCancel,
}: {
  t: Dict["admin"];
  cfgDict: Dict["cfg"];
  initial?: TypeProfile;
  onSave: (tp: TypeProfile) => void;
  onCancel: () => void;
}) {
  const d = t.designer;
  const [nameDe, setNameDe] = useState(initial?.name?.de ?? "");
  const [nameFr, setNameFr] = useState(initial?.name?.fr ?? "");
  const [nameEn, setNameEn] = useState(initial?.name?.en ?? "");
  const [basePerM, setBasePerM] = useState(initial?.basePerM ?? 240);
  const [recipe, setRecipe] = useState<TypeRecipe>(
    initial?.recipe ??
      (initial
        ? {
            ...defaultRecipe(),
            infill: { ...defaultRecipe().infill, memberSize: initial.barDia, maxPanelWidth: initial.maxPanelWidth },
            maxSlope: initial.maxSlope,
          }
        : defaultRecipe()),
  );

  const set = (patch: Partial<TypeRecipe>) => setRecipe((r) => ({ ...r, ...patch }));

  // Live preview: a fixed L-shaped demo run evaluated with the draft recipe.
  const preview = useMemo(() => {
    const tp: TypeProfile = {
      id: initial?.id ?? "preview",
      template: recipe.infill.kind === "glass" ? "glass" : "bars",
      basePerM,
      barDia: recipe.infill.memberSize,
      maxSlope: recipe.maxSlope,
      maxPanelWidth: recipe.infill.maxPanelWidth,
      active: true,
      builtin: false,
      recipe,
    };
    const cfg = normalizeForType(defaultConfig(), tp);
    const derived = deriveRailing(cfg, tp);
    const sia = evaluateSia(cfg, derived, tp);
    const price = priceRailing(cfg, derived, defaultPriceBook, tp);
    return { tp, cfg, derived, overall: siaSummary(sia), price };
  }, [recipe, basePerM, initial?.id]);

  const inputCls =
    "w-full border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none placeholder:text-stone focus:border-graphite";

  const isPanels = recipe.infill.kind === "glass" || recipe.infill.kind === "sheet";
  const isMembers = !isPanels;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: initial?.id ?? "ct-" + Math.random().toString(36).slice(2, 8),
          template: recipe.infill.kind === "glass" ? "glass" : "bars",
          name: { de: nameDe, fr: nameFr || nameDe, en: nameEn || nameDe },
          basePerM,
          barDia: recipe.infill.memberSize,
          maxSlope: recipe.maxSlope,
          maxPanelWidth: recipe.infill.maxPanelWidth,
          active: initial?.active ?? true,
          builtin: false,
          recipe,
        });
      }}
      className="flex flex-col gap-5 border border-ink/60 p-5 lg:col-span-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink">{d.title}</span>
        <p className="max-w-xl text-xs font-light leading-relaxed text-stone">{d.hint}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ---------- parameters ---------- */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2.5">
            <input required placeholder={t.typesForm.nameDe} value={nameDe} onChange={(e) => setNameDe(e.target.value)} className={`${inputCls} col-span-2`} />
            <input placeholder={t.typesForm.nameFr} value={nameFr} onChange={(e) => setNameFr(e.target.value)} className={inputCls} />
            <input placeholder={t.typesForm.nameEn} value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} />
          </div>

          <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-graphite">{d.infill}</span>
            <PillRow
              label={d.kind}
              value={recipe.infill.kind}
              options={(["vertical_bars", "vertical_flats", "horizontal_rails", "cables", "glass", "sheet"] as InfillKind[]).map((v) => ({
                v,
                l: cfgDict.infillKinds[v],
              }))}
              onChange={(kind) =>
                set({
                  infill:
                    kind === "vertical_flats"
                      ? { ...recipe.infill, kind, memberSize: 5, flatW: recipe.infill.flatW ?? 40, flatT: recipe.infill.flatT ?? 5, pitch: recipe.infill.pitch ?? 144.5, angleDeg: recipe.infill.angleDeg ?? 45 }
                      : { ...recipe.infill, kind, memberSize: kind === "cables" ? 5 : kind === "glass" ? 17 : kind === "sheet" ? 3 : 12 },
                })
              }
            />
            {recipe.infill.kind === "vertical_flats" ? (
              <div className="grid grid-cols-2 gap-2.5">
                <Num label={d.flatW} value={recipe.infill.flatW ?? 40} min={20} max={80} onChange={(v) => set({ infill: { ...recipe.infill, flatW: v } })} />
                <Num label={d.flatT} value={recipe.infill.flatT ?? 5} min={3} max={12} onChange={(v) => set({ infill: { ...recipe.infill, flatT: v, memberSize: v } })} />
                <Num label={d.pitch} value={recipe.infill.pitch ?? 144.5} min={60} max={200} step={0.5} onChange={(v) => set({ infill: { ...recipe.infill, pitch: v } })} />
                <Num label={d.angle} value={recipe.infill.angleDeg ?? 45} min={0} max={60} step={5} onChange={(v) => set({ infill: { ...recipe.infill, angleDeg: v } })} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <Num label={d.memberSize} value={recipe.infill.memberSize} min={2} max={40} onChange={(v) => set({ infill: { ...recipe.infill, memberSize: v } })} />
                {isMembers ? (
                  <Num label={d.maxOpening} value={recipe.infill.maxOpening} min={20} max={300} step={5} onChange={(v) => set({ infill: { ...recipe.infill, maxOpening: v } })} />
                ) : (
                  <Num label={d.maxPanelWidth} value={recipe.infill.maxPanelWidth} min={300} max={2500} step={50} onChange={(v) => set({ infill: { ...recipe.infill, maxPanelWidth: v } })} />
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-graphite">{d.post}</span>
            <PillRow
              label={d.profile}
              value={recipe.post.profile}
              options={(["square", "rect", "round", "none"] as PostProfile[]).map((v) => ({ v, l: d[v] }))}
              onChange={(profile) => set({ post: { ...recipe.post, profile, depth: profile === "rect" ? (recipe.post.depth ?? 60) : recipe.post.depth } })}
            />
            {recipe.post.profile !== "none" && (
              <div className={`grid gap-2.5 ${recipe.post.profile === "rect" ? "grid-cols-3" : "grid-cols-2"}`}>
                <Num label={d.size} value={recipe.post.size} min={15} max={120} onChange={(v) => set({ post: { ...recipe.post, size: v } })} />
                {recipe.post.profile === "rect" && (
                  <Num label={d.depth} value={recipe.post.depth ?? 60} min={20} max={150} onChange={(v) => set({ post: { ...recipe.post, depth: v } })} />
                )}
                <Num label={d.maxSpacing} value={recipe.post.maxSpacing} min={400} max={2500} step={50} onChange={(v) => set({ post: { ...recipe.post, maxSpacing: v } })} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-3">
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-graphite">{d.handrail}</span>
              <PillRow
                label={d.profile}
                value={recipe.handrail.profile}
                options={(["round", "flat", "rect", "none"] as RailProfileKind[]).map((v) => ({ v, l: d[v] }))}
                onChange={(profile) => set({ handrail: { ...recipe.handrail, profile, depth: profile === "rect" ? (recipe.handrail.depth ?? 60) : recipe.handrail.depth } })}
              />
              {recipe.handrail.profile !== "none" && (
                <Num label={d.size} value={recipe.handrail.size} min={15} max={120} onChange={(v) => set({ handrail: { ...recipe.handrail, size: v } })} />
              )}
              {recipe.handrail.profile === "rect" && (
                <Num label={d.depth} value={recipe.handrail.depth ?? 60} min={20} max={150} onChange={(v) => set({ handrail: { ...recipe.handrail, depth: v } })} />
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-graphite">{d.bottomRail}</span>
              <PillRow
                label={d.profile}
                value={recipe.bottomRail.profile}
                options={(["flat", "round", "rect", "none"] as RailProfileKind[]).map((v) => ({ v, l: d[v] }))}
                onChange={(profile) => set({ bottomRail: { ...recipe.bottomRail, profile, depth: profile === "rect" ? (recipe.bottomRail.depth ?? 60) : recipe.bottomRail.depth } })}
              />
              {recipe.bottomRail.profile !== "none" && (
                <Num label={d.size} value={recipe.bottomRail.size} min={10} max={80} onChange={(v) => set({ bottomRail: { ...recipe.bottomRail, size: v } })} />
              )}
              {recipe.bottomRail.profile === "rect" && (
                <Num label={d.depth} value={recipe.bottomRail.depth ?? 60} min={20} max={150} onChange={(v) => set({ bottomRail: { ...recipe.bottomRail, depth: v } })} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 border-t border-hairline pt-3">
            <Num label={d.maxSlope} value={recipe.maxSlope} min={0} max={45} onChange={(v) => set({ maxSlope: v })} />
            <Num label={t.typesForm.basePerM} value={basePerM} min={50} max={3000} step={5} onChange={setBasePerM} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" className="inline-flex items-center justify-center bg-ink px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite">
              {t.typesForm.save}
            </button>
            <button type="button" onClick={onCancel} className="inline-flex items-center justify-center border border-hairline px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite">
              {t.typesForm.cancel}
            </button>
          </div>
        </div>

        {/* ---------- live preview ---------- */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{d.preview}</span>
            <span
              className="border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: STATUS_COLOR[preview.overall], borderColor: STATUS_COLOR[preview.overall] }}
            >
              {cfgDict.siaBadge[preview.overall]}
            </span>
          </div>
          <div className="h-[320px] overflow-hidden border border-hairline lg:h-[420px]">
            <Scene3D cfg={preview.cfg} derived={preview.derived} tp={preview.tp} />
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-hairline pt-2">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] font-light text-graphite">
              {preview.derived.postCount > 0 && (
                <span>
                  {cfgDict.stats.posts} <span className="text-ink">{preview.derived.postCount}</span>
                </span>
              )}
              {preview.derived.barCount > 0 && (
                <span>
                  {cfgDict.stats.bars} <span className="text-ink">{preview.derived.barCount}</span>
                </span>
              )}
              {preview.derived.railCount > 0 && (
                <span>
                  {cfgDict.statsRails} <span className="text-ink">{preview.derived.railCount}</span>
                </span>
              )}
              {preview.derived.panelCount > 0 && (
                <span>
                  {cfgDict.statsPanels} <span className="text-ink">{preview.derived.panelCount}</span>
                </span>
              )}
              <span>
                {cfgDict.stats.weight} <span className="text-ink">{preview.derived.weightKg} kg</span>
              </span>
            </div>
            <span className="text-lg font-light tracking-tight text-ink">{chf(preview.price.gross)}</span>
          </div>
        </div>
      </div>
    </form>
  );
}
