"use client";

import { Fragment, useEffect, useState } from "react";
import { chf, defaultPriceBook, type PriceBook } from "@/lib/engine/pricing";
import { deriveRailing } from "@/lib/engine/geometry";
import { buildBom } from "@/lib/engine/bom";
import { type System, type TypeProfile } from "@/lib/engine/types";
import {
  deleteCustomType,
  findType,
  loadAllTypes,
  loadOrders,
  loadPriceBook,
  ORDER_FLOW,
  QUOTE_FLOW,
  resetPriceBook,
  saveCustomType,
  savePriceBook,
  updateOrderStatus,
  type Order,
  type OrderStatus,
} from "@/lib/store";
import type { Dict } from "@/lib/i18n";

type AdminDict = Dict["admin"];
type Tab = "orders" | "pricing" | "products";

/* ---------- orders tab ---------- */

function BomDetail({ order, t }: { order: Order; t: AdminDict }) {
  if (!order.config) {
    return <p className="py-2 text-sm font-light text-stone">{t.bom.noBom}</p>;
  }
  const tp = findType(order.config.typeId, order.config.system);
  const derived = deriveRailing(order.config, tp);
  const bom = buildBom(order.config, derived, tp);
  const parts: Record<string, string> = t.bom.parts;

  return (
    <div className="grid gap-8 py-2 md:grid-cols-[1fr_1fr]">
      <div className="flex flex-col">
        <span className="pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.bom.title}</span>
        {bom.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 border-t border-hairline/70 py-1.5">
            <span className="text-[13px] font-light text-graphite">
              {parts[l.id] ?? l.id}
              {l.detail && <span className="text-stone"> · {l.detail}</span>}
            </span>
            <span className="whitespace-nowrap text-[13px] font-light text-ink">
              {l.qty.toLocaleString("de-CH")} {t.bom.units[l.unit]}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.bom.address}</span>
          <p className="pt-1 text-sm font-light text-graphite">
            {order.customer.name} · {order.customer.street}, {order.customer.city}
            <span className="block text-xs text-stone">{order.customer.email}</span>
          </p>
        </div>
        {order.payment && (
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.bom.payment}</span>
            <p className="pt-1 text-sm font-light uppercase text-graphite">{order.payment}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersTable({ t, statusLabels, cfgDict }: { t: AdminDict; statusLabels: Dict["portal"]["status"]; cfgDict: Dict["cfg"] }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => setOrders(loadOrders()), []);

  const advance = (ref: string, status: OrderStatus) => {
    updateOrderStatus(ref, status);
    setOrders(loadOrders());
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-ink/50">
            {[t.table.ref, t.table.date, t.table.customer, t.table.system, t.table.length, t.table.total, t.table.kind, t.table.status, ""].map((h, i) => (
              <th key={i} className="py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const flow = o.kind === "order" ? ORDER_FLOW : QUOTE_FLOW;
            const expanded = open === o.ref;
            return (
              <Fragment key={o.ref}>
                <tr className={`align-baseline ${expanded ? "" : "border-b border-hairline"}`}>
                  <td className="py-3 pr-4 text-sm text-ink">{o.ref}</td>
                  <td className="py-3 pr-4 text-sm font-light text-graphite">{o.createdAt}</td>
                  <td className="py-3 pr-4 text-sm font-light text-graphite">
                    {o.customer.name}
                    <span className="block text-xs text-stone">{o.customer.city}</span>
                  </td>
                  <td className="py-3 pr-4 text-sm font-light text-graphite">
                    {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars}
                  </td>
                  <td className="py-3 pr-4 text-sm font-light text-graphite">{o.lengthM.toLocaleString("de-CH")} m</td>
                  <td className="py-3 pr-4 whitespace-nowrap text-sm font-light text-ink">{chf(o.gross)}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                        o.kind === "order" ? "border-ink/40 text-ink" : "border-steel/50 text-steel"
                      }`}
                    >
                      {t.kind[o.kind]}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={o.status}
                      onChange={(e) => advance(o.ref, e.target.value as OrderStatus)}
                      className="border border-hairline bg-paper px-2 py-1.5 text-xs font-light text-ink outline-none focus:border-graphite"
                    >
                      {flow.map((s) => (
                        <option key={s} value={s}>
                          {statusLabels[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : o.ref)}
                      className="text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline"
                    >
                      {expanded ? t.bom.hide : t.bom.show}
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-hairline bg-mist/40">
                    <td colSpan={9} className="px-4">
                      <BomDetail order={o} t={t} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- pricing tab ---------- */

function PricingEditor({ t }: { t: AdminDict }) {
  const [pb, setPb] = useState<PriceBook>(defaultPriceBook);
  const [saved, setSaved] = useState(false);

  useEffect(() => setPb(loadPriceBook()), []);

  const fields: { key: string; label: string; get: () => number; set: (v: number) => void }[] = [
    { key: "basePerM", label: t.fields.basePerM, get: () => pb.basePerM, set: (v) => setPb({ ...pb, basePerM: v }) },
    { key: "glassBasePerM", label: t.fields.glassBasePerM, get: () => pb.glassBasePerM, set: (v) => setPb({ ...pb, glassBasePerM: v }) },
    { key: "glassFreeEdgePerM", label: t.fields.glassFreeEdgePerM, get: () => pb.glassFreeEdgePerM, set: (v) => setPb({ ...pb, glassFreeEdgePerM: v }) },
    { key: "glassSatin", label: t.fields.glassSatin, get: () => pb.glassTypePerM.satin, set: (v) => setPb({ ...pb, glassTypePerM: { ...pb.glassTypePerM, satin: v } }) },
    { key: "glassTinted", label: t.fields.glassTinted, get: () => pb.glassTypePerM.tinted, set: (v) => setPb({ ...pb, glassTypePerM: { ...pb.glassTypePerM, tinted: v } }) },
    { key: "hrFlat", label: t.fields.hrFlat, get: () => pb.handrailPerM.flat_steel, set: (v) => setPb({ ...pb, handrailPerM: { ...pb.handrailPerM, flat_steel: v } }) },
    { key: "hrInox", label: t.fields.hrInox, get: () => pb.handrailPerM.round_inox, set: (v) => setPb({ ...pb, handrailPerM: { ...pb.handrailPerM, round_inox: v } }) },
    { key: "colorCustom", label: t.fields.colorCustom, get: () => pb.colorPerM.custom, set: (v) => setPb({ ...pb, colorPerM: { ...pb.colorPerM, custom: v } }) },
    { key: "stairPerM", label: t.fields.stairPerM, get: () => pb.stairPerM, set: (v) => setPb({ ...pb, stairPerM: v }) },
    { key: "sideMountPerM", label: t.fields.sideMountPerM, get: () => pb.sideMountPerM, set: (v) => setPb({ ...pb, sideMountPerM: v }) },
    { key: "publicPerM", label: t.fields.publicPerM, get: () => pb.publicUsagePerM, set: (v) => setPb({ ...pb, publicUsagePerM: v }) },
    { key: "cornerEach", label: t.fields.cornerEach, get: () => pb.cornerEach, set: (v) => setPb({ ...pb, cornerEach: v }) },
    { key: "cornerEachGlass", label: t.fields.cornerEachGlass, get: () => pb.cornerEachGlass, set: (v) => setPb({ ...pb, cornerEachGlass: v }) },
    { key: "setupFee", label: t.fields.setupFee, get: () => pb.setupFee, set: (v) => setPb({ ...pb, setupFee: v }) },
    { key: "shippingFlat", label: t.fields.shippingFlat, get: () => pb.shippingFlat, set: (v) => setPb({ ...pb, shippingFlat: v }) },
    { key: "freeShippingFrom", label: t.fields.freeShippingFrom, get: () => pb.freeShippingFrom, set: (v) => setPb({ ...pb, freeShippingFrom: v }) },
    { key: "vatPct", label: t.fields.vatPct, get: () => Math.round(pb.vatRate * 1000) / 10, set: (v) => setPb({ ...pb, vatRate: v / 100 }) },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm font-light leading-relaxed text-graphite">{t.pricingHint}</p>
      <p className="text-xs font-light text-stone">
        {t.version}: <span className="text-ink">{pb.version}</span>
      </p>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{f.label}</span>
            <span className="flex items-center border border-hairline bg-paper focus-within:border-graphite">
              <input
                type="number"
                value={f.get()}
                step={1}
                min={0}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) {
                    f.set(n);
                    setSaved(false);
                  }
                }}
                className="w-full bg-transparent px-3 py-2 text-sm font-light text-ink outline-none"
              />
              <span className="pr-3 text-xs text-stone">{f.key === "vatPct" ? "%" : "CHF"}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            savePriceBook(pb);
            setPb(loadPriceBook());
            setSaved(true);
          }}
          className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => {
            resetPriceBook();
            setPb(loadPriceBook());
            setSaved(false);
          }}
          className="inline-flex items-center justify-center border border-ink/25 px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-ink transition-colors hover:border-ink"
        >
          {t.reset}
        </button>
      </div>
      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {t.savedMsg}
        </p>
      )}
    </div>
  );
}

/* ---------- products tab: guardrail type builder ---------- */

const emptyDraft = () => ({
  template: "bars" as System,
  nameDe: "",
  nameFr: "",
  nameEn: "",
  basePerM: 220,
  barDia: 14,
  maxSlope: 30,
  maxPanelWidth: 1100,
});

function ProductsTab({ t }: { t: AdminDict }) {
  const [types, setTypes] = useState<TypeProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [created, setCreated] = useState(false);

  useEffect(() => setTypes(loadAllTypes()), []);
  const refresh = () => setTypes(loadAllTypes());

  const inputCls =
    "w-full border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

  const specFor = (x: TypeProfile) =>
    x.builtin
      ? x.template === "bars"
        ? t.productBarsSpec
        : t.productGlassSpec
      : x.template === "bars"
        ? `Ø ${x.barDia} mm · ≤ ${x.maxSlope}° · CHF ${x.basePerM}/m`
        : `VSG · ≤ ${x.maxPanelWidth} mm · CHF ${x.basePerM}/m`;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {types.map((x) => (
          <div key={x.id} className={`flex flex-col gap-2 border border-hairline p-5 ${x.active ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink">
                {x.builtin ? (x.template === "bars" ? t.productBars : t.productGlass) : (x.name?.de ?? x.id)}
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
                    saveCustomType({ ...x, active: !x.active });
                    refresh();
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-graphite underline-offset-2 hover:text-ink hover:underline"
                >
                  {x.active ? t.typesForm.inactive : t.productsActive}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteCustomType(x.id);
                    refresh();
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-[#b04a3a] underline-offset-2 hover:underline"
                >
                  {t.typesForm.delete}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!showForm ? (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyDraft());
            setCreated(false);
            setShowForm(true);
          }}
          className="flex flex-col gap-2 border border-dashed border-hairline p-5 text-left transition-colors hover:border-graphite"
        >
          <span className="text-sm text-graphite">+ {t.newType}</span>
          <p className="text-xs font-light leading-relaxed text-stone">{t.newTypeNote}</p>
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCustomType({
              id: "ct-" + Math.random().toString(36).slice(2, 8),
              template: draft.template,
              name: {
                de: draft.nameDe,
                fr: draft.nameFr || draft.nameDe,
                en: draft.nameEn || draft.nameDe,
              },
              basePerM: draft.basePerM,
              barDia: draft.barDia,
              maxSlope: draft.template === "glass" ? 0 : draft.maxSlope,
              maxPanelWidth: draft.maxPanelWidth,
              active: true,
              builtin: false,
            });
            refresh();
            setShowForm(false);
            setCreated(true);
          }}
          className="flex flex-col gap-4 border border-ink/60 p-5"
        >
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink">{t.newType}</span>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{t.typesForm.template}</span>
            <div className="flex gap-2">
              {(["bars", "glass"] as const).map((tmpl) => (
                <button
                  key={tmpl}
                  type="button"
                  onClick={() => setDraft({ ...draft, template: tmpl })}
                  className={`border px-3.5 py-2 text-xs tracking-[0.06em] transition-colors ${
                    draft.template === tmpl ? "border-ink bg-ink text-paper" : "border-hairline text-graphite hover:border-graphite"
                  }`}
                >
                  {tmpl === "bars" ? t.productBars : t.productGlass}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <input required placeholder={t.typesForm.nameDe} value={draft.nameDe} onChange={(e) => setDraft({ ...draft, nameDe: e.target.value })} className={inputCls} />
            <input placeholder={t.typesForm.nameFr} value={draft.nameFr} onChange={(e) => setDraft({ ...draft, nameFr: e.target.value })} className={inputCls} />
            <input placeholder={t.typesForm.nameEn} value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} className={inputCls} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{t.typesForm.basePerM}</span>
              <input type="number" min={50} max={2000} value={draft.basePerM} onChange={(e) => setDraft({ ...draft, basePerM: Number(e.target.value) })} className={inputCls} />
            </label>
            {draft.template === "bars" ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{t.typesForm.barDia}</span>
                  <input type="number" min={8} max={30} value={draft.barDia} onChange={(e) => setDraft({ ...draft, barDia: Number(e.target.value) })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{t.typesForm.maxSlope}</span>
                  <input type="number" min={0} max={45} value={draft.maxSlope} onChange={(e) => setDraft({ ...draft, maxSlope: Number(e.target.value) })} className={inputCls} />
                </label>
              </>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{t.typesForm.maxPanelWidth}</span>
                <input type="number" min={400} max={2000} value={draft.maxPanelWidth} onChange={(e) => setDraft({ ...draft, maxPanelWidth: Number(e.target.value) })} className={inputCls} />
              </label>
            )}
          </div>

          <div className="flex gap-3">
            <button type="submit" className="inline-flex items-center justify-center bg-ink px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite">
              {t.typesForm.save}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="inline-flex items-center justify-center border border-hairline px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite">
              {t.typesForm.cancel}
            </button>
          </div>
        </form>
      )}

      {created && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {t.typesForm.created}
        </p>
      )}
    </div>
  );
}

/* ---------- shell ---------- */

export default function AdminApp({
  t,
  statusLabels,
  cfgDict,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
}) {
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-px self-start bg-hairline">
        {(["orders", "pricing", "products"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`px-5 py-2.5 text-xs uppercase tracking-[0.14em] transition-colors ${
              tab === v ? "bg-ink text-paper" : "bg-paper text-graphite hover:text-ink"
            }`}
          >
            {t.tabs[v]}
          </button>
        ))}
      </div>

      {tab === "orders" && <OrdersTable t={t} statusLabels={statusLabels} cfgDict={cfgDict} />}
      {tab === "pricing" && <PricingEditor t={t} />}
      {tab === "products" && <ProductsTab t={t} />}
    </div>
  );
}
