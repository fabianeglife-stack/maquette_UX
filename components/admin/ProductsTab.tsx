"use client";

/* Products tab: parametric type designer + principle plans per type × fixing. */

import { useEffect, useState } from "react";
import { type Substrate, type TypeProfile } from "@/lib/engine/types";
import type { Mounting, PlanKey, TypePlans } from "@/lib/store";
// Type-only import — erased at compile time, so the server-only OCCT module is
// never pulled into the client bundle.
import type { StepTemplate, StepTemplates, TubeRole } from "@/lib/cad/step";
import { fetchAllTypes, fetchPageContent, putPageContent, removeType, saveType } from "@/lib/data";
import type { Dict } from "@/lib/i18n";
import { notify } from "@/lib/toast";
import TypeDesigner from "./TypeDesigner";
import type { AdminDict } from "./shared";

/** Read an uploaded principle-drawing PDF as a data URL (≤ 3 MB). */
function readPdfFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== "application/pdf") return reject(new Error("not_pdf"));
    if (file.size > 3 * 1024 * 1024) return reject(new Error("too_big"));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

function PlanCell({
  t,
  typeId,
  slot,
  label,
  current,
  hasDefault,
  onChange,
}: {
  t: AdminDict;
  typeId: string;
  /** Storage key for this fixing situation (substrate id). */
  slot: string;
  label: string;
  current?: string;
  hasDefault: boolean;
  onChange: (value?: string) => void;
}) {
  const [err, setErr] = useState(false);
  const pick = (
    <label className="cursor-pointer border border-hairline px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink">
      {current ? t.plans.replace : t.plans.upload}
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            setErr(false);
            onChange(await readPdfFile(f));
          } catch {
            setErr(true);
          }
        }}
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-hairline/70 p-3">
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-graphite">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {current && (
          <>
            <a
              href={current}
              download={`axioform-plan-${typeId}-${slot}.pdf`}
              className="border border-ink/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              ↓ {t.plans.view}
            </a>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="px-1 text-[10px] uppercase tracking-[0.12em] text-alert underline-offset-2 hover:underline"
            >
              {t.plans.remove}
            </button>
          </>
        )}
        {pick}
      </div>
      {!current && hasDefault && <span className="text-[10px] font-light text-stone">{t.plans.defaultNote}</span>}
      {err && (
        <span role="alert" className="text-[10px] text-alert">
          {t.plans.tooBig}
        </span>
      )}
    </div>
  );
}

/** All fixing situations offered in the configurator, one plan slot each. */
const PLAN_SUBSTRATES: Substrate[] = [
  "concrete_top",
  "concrete_side",
  "concrete_side_offset",
  "concrete_parapet",
  "wood_side",
  "stone_top",
];

const MOUNTINGS: Mounting[] = ["top", "side"];

/** Upload one principle drawing (PDF) per type × wall situation × fixing. */
function PlansSection({ t, cfgDict, types }: { t: AdminDict; cfgDict: Dict["cfg"]; types: TypeProfile[] }) {
  const [plans, setPlans] = useState<TypePlans>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetchPageContent<TypePlans>("typeplans", {}).then(setPlans);
  }, []);

  const set = (typeId: string, substrate: Substrate, mounting: Mounting, value?: string) => {
    const key: PlanKey = `${substrate}|${mounting}`;
    const entry = { ...(plans[typeId] ?? {}) };
    if (value) {
      entry[key] = value;
    } else if (entry[key]) {
      delete entry[key];
    } else {
      // The cell displayed an inherited legacy plan — remove those instead.
      delete entry[substrate];
      delete entry[mounting];
    }
    const next = { ...plans, [typeId]: entry };
    setPlans(next);
    putPageContent("typeplans", next)
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .catch(() => notify("saveFailed"));
  };

  const active = types.filter((x) => x.active);
  return (
    <div className="flex max-w-4xl flex-col gap-4 border border-hairline p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink">{t.plans.title}</span>
        {saved && (
          <span role="status" className="text-[11px] font-light text-steel">
            {t.plans.saved}
          </span>
        )}
      </div>
      <p className="text-xs font-light leading-relaxed text-stone">{t.plans.hint}</p>
      {active.map((x) => (
        <div key={x.id} className="flex flex-col gap-2.5 border-t border-hairline/70 pt-3">
          <span className="text-sm text-ink">{x.name?.de ?? x.id}</span>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {PLAN_SUBSTRATES.map((s) => (
              <div key={s} className="flex flex-col gap-1.5 rounded-md border border-hairline/70 p-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-graphite">{cfgDict.substrates[s]}</span>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {MOUNTINGS.map((m) => (
                    <PlanCell
                      key={m}
                      t={t}
                      typeId={x.id}
                      slot={`${s}|${m}`}
                      label={m === "top" ? cfgDict.mountingTop : cfgDict.mountingSide}
                      current={plans[x.id]?.[`${s}|${m}`] ?? plans[x.id]?.[s] ?? plans[x.id]?.[m]}
                      hasDefault={!!x.planUrl}
                      onChange={(v) => set(x.id, s, m, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Read an uploaded STEP template as a data URL (≤ 4 MB, .step/.stp only). */
function readStepFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".step") && !name.endsWith(".stp")) return reject(new Error("not_step"));
    if (file.size > 4 * 1024 * 1024) return reject(new Error("too_big"));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

const STEP_ROLE_ORDER: TubeRole[] = ["posts", "bars", "railsPart", "handrailPart", "bottomRail"];

/** Tube roles that carry a laser-cut template for a given recipe type. */
function stepRolesFor(tp: TypeProfile): TubeRole[] {
  if (!tp.recipe) return [];
  const roles: TubeRole[] = ["posts"];
  const kind = tp.recipe.infill.kind;
  if (kind === "vertical_bars" || kind === "vertical_flats") roles.push("bars");
  else if (kind === "horizontal_rails") roles.push("railsPart");
  roles.push("handrailPart", "bottomRail");
  return roles.filter((r) => STEP_ROLE_ORDER.includes(r));
}

/** One tube role's STEP template: upload/replace, remove, and the straight-end margin. */
function StepCell({
  t,
  label,
  tpl,
  onFile,
  onMargin,
  onRemove,
}: {
  t: AdminDict;
  label: string;
  tpl?: StepTemplate;
  onFile: (step: string) => void;
  onMargin: (m?: number) => void;
  onRemove: () => void;
}) {
  const [err, setErr] = useState<"too_big" | "not_step" | null>(null);
  const has = Boolean(tpl?.step);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-hairline/70 p-3">
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-graphite">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer border border-hairline px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite hover:text-ink">
          {has ? t.stepTpl.replace : t.stepTpl.upload}
          <input
            type="file"
            accept=".step,.stp,application/step,model/step,application/octet-stream"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setErr(null);
                onFile(await readStepFile(f));
              } catch (ex) {
                setErr((ex as Error).message === "not_step" ? "not_step" : "too_big");
              }
            }}
          />
        </label>
        {has && (
          <button
            type="button"
            onClick={onRemove}
            className="px-1 text-[10px] uppercase tracking-[0.12em] text-alert underline-offset-2 hover:underline"
          >
            {t.stepTpl.remove}
          </button>
        )}
        <span className={`text-[10px] ${has ? "text-steel" : "text-stone"}`}>{has ? t.stepTpl.loaded : t.stepTpl.none}</span>
      </div>
      <label className="flex items-center gap-2 text-[10px] text-graphite">
        <span className="whitespace-nowrap">{t.stepTpl.margin}</span>
        <input
          type="number"
          min={0}
          step={5}
          defaultValue={tpl?.marginMm ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            onMargin(v === "" ? undefined : Math.max(0, Number(v) || 0));
          }}
          className="w-20 border border-hairline px-2 py-1 text-[11px]"
        />
      </label>
      <span className="text-[10px] font-light text-stone">{t.stepTpl.marginHint}</span>
      {err && (
        <span role="alert" className="text-[10px] text-alert">
          {err === "not_step" ? t.stepTpl.notStep : t.stepTpl.tooBig}
        </span>
      )}
    </div>
  );
}

/** Upload one Inventor STEP template (with notches) per type × tube role. */
function StepTemplatesSection({ t, types }: { t: AdminDict; types: TypeProfile[] }) {
  const [tpls, setTpls] = useState<StepTemplates>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetchPageContent<StepTemplates>("steptemplates", {}).then(setTpls);
  }, []);

  const persist = (next: StepTemplates) => {
    setTpls(next);
    putPageContent("steptemplates", next)
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      })
      .catch(() => notify("saveFailed"));
  };

  const setTpl = (typeId: string, role: TubeRole, patch: Partial<StepTemplate> | null) => {
    const entry = { ...(tpls[typeId] ?? {}) };
    if (patch === null) {
      delete entry[role];
    } else {
      entry[role] = { ...(entry[role] ?? { step: "" }), ...patch };
    }
    persist({ ...tpls, [typeId]: entry });
  };

  const recipeTypes = types.filter((x) => x.active && x.recipe);
  if (recipeTypes.length === 0) return null;
  return (
    <div className="flex max-w-4xl flex-col gap-4 border border-hairline p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink">{t.stepTpl.title}</span>
        {saved && (
          <span role="status" className="text-[11px] font-light text-steel">
            {t.stepTpl.saved}
          </span>
        )}
      </div>
      <p className="text-xs font-light leading-relaxed text-stone">{t.stepTpl.hint}</p>
      {recipeTypes.map((x) => (
        <div key={x.id} className="flex flex-col gap-2.5 border-t border-hairline/70 pt-3">
          <span className="text-sm text-ink">{x.name?.de ?? x.id}</span>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {stepRolesFor(x).map((role) => (
              <StepCell
                key={role}
                t={t}
                label={t.stepTpl.roles[role]}
                tpl={tpls[x.id]?.[role]}
                onFile={(step) => setTpl(x.id, role, { step })}
                onMargin={(marginMm) => setTpl(x.id, role, { marginMm })}
                onRemove={() => setTpl(x.id, role, null)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProductsTab({ t, cfgDict }: { t: AdminDict; cfgDict: Dict["cfg"] }) {
  const [types, setTypes] = useState<TypeProfile[]>([]);
  const [designer, setDesigner] = useState<"new" | TypeProfile | null>(null);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    fetchAllTypes().then(setTypes);
  }, []);
  const refresh = () => fetchAllTypes().then(setTypes);

  const specFor = (x: TypeProfile) =>
    x.recipe
      ? `${
          x.recipe.infill.kind === "vertical_flats"
            ? `${cfgDict.infillKinds.vertical_flats} ${x.recipe.infill.angleDeg ? `${x.recipe.infill.angleDeg}°` : cfgDict.infillStraight}`
            : cfgDict.infillKinds[x.recipe.infill.kind]
        } · ≤ ${x.maxSlope}° · CHF ${x.basePerM}/m`
      : x.builtin
        ? x.template === "bars"
          ? t.productBarsSpec
          : t.productGlassSpec
        : x.template === "bars"
          ? `Ø ${x.barDia} mm · ≤ ${x.maxSlope}° · CHF ${x.basePerM}/m`
          : `VSG · ≤ ${x.maxPanelWidth} mm · CHF ${x.basePerM}/m`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        {types.map((x) => (
          <div key={x.id} className={`flex flex-col gap-2 border border-hairline p-5 ${x.active ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink">
                {x.name?.de ?? (x.builtin ? (x.template === "bars" ? t.productBars : t.productGlass) : x.id)}
              </span>
              <span
                className={`border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                  x.active ? "border-[#4a7c59] text-[#4a7c59]" : "border-stone text-stone"
                }`}
              >
                {x.active ? t.productsActive : t.typesForm.inactive}
              </span>
            </div>
            <p className="text-xs font-light leading-relaxed text-graphite">{specFor(x)}</p>
            {!x.builtin && (
              <div className="flex gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCreated(false);
                    setDesigner(x);
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-ink underline underline-offset-2"
                >
                  {t.designer.edit}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveType({ ...x, active: !x.active }).then(refresh).catch(() => notify("saveFailed"));
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-graphite underline-offset-2 hover:text-ink hover:underline"
                >
                  {x.active ? t.typesForm.inactive : t.productsActive}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeType(x.id).then(refresh).catch(() => notify("saveFailed"));
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-alert underline-offset-2 hover:underline"
                >
                  {t.typesForm.delete}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {designer ? (
        <TypeDesigner
          t={t}
          cfgDict={cfgDict}
          initial={designer === "new" ? undefined : designer}
          onCancel={() => setDesigner(null)}
          onSave={(tp) => {
            saveType(tp)
              .then(() => {
                refresh();
                setDesigner(null);
                setCreated(true);
              })
              .catch(() => notify("saveFailed"));
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setCreated(false);
            setDesigner("new");
          }}
          className="flex max-w-3xl flex-col gap-2 border border-dashed border-hairline p-5 text-left transition-colors hover:border-graphite"
        >
          <span className="text-sm text-graphite">+ {t.newType}</span>
          <p className="text-xs font-light leading-relaxed text-stone">{t.newTypeNote}</p>
        </button>
      )}

      {created && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {t.typesForm.created}
        </p>
      )}

      <PlansSection t={t} cfgDict={cfgDict} types={types} />

      <StepTemplatesSection t={t} types={types} />
    </div>
  );
}
