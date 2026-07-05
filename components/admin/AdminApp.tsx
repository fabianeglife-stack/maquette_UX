"use client";

import { Fragment, useEffect, useState } from "react";
import { chf, defaultPriceBook, type PriceBook } from "@/lib/engine/pricing";
import { deriveRailing } from "@/lib/engine/geometry";
import { buildBom } from "@/lib/engine/bom";
import { type TypeProfile } from "@/lib/engine/types";
import {
  loadEvents,
  loadOrders,
  loadTiers,
  logEvent,
  ORDER_FLOW,
  QUOTE_FLOW,
  setTier,
  updateOrder,
  updateOrderStatus,
  type ContentState,
  type Order,
  type OrderEvent,
  type OrderStatus,
  type RefProject,
  type Tier,
} from "@/lib/store";
import {
  fetchAllTypes,
  fetchContent,
  fetchPriceBook,
  publishPriceBook,
  putContent,
  removeType,
  resetPriceBookAll,
  resolveType,
  saveType,
} from "@/lib/data";
import type { Dict } from "@/lib/i18n";
import { api, hasBackend, type ApiOrder } from "@/lib/api";
import Link from "next/link";
import TypeDesigner from "./TypeDesigner";

type AdminDict = Dict["admin"];
type Tab = "dashboard" | "orders" | "customers" | "pricing" | "products" | "content";

/* ---------- dashboard tab ---------- */

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 border border-hairline p-5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{label}</span>
      <span className="text-2xl font-light tracking-tight text-ink">{value}</span>
    </div>
  );
}

function BarRow({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-[12px] font-light text-graphite">{label}</span>
      <div className="h-4 flex-1 bg-mist">
        <div className="h-full bg-graphite" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-[12px] font-light text-ink">{display}</span>
    </div>
  );
}

function DashboardTab({
  t,
  statusLabels,
  cfgDict,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    if (hasBackend) api.listOrders().then(setOrders).catch(() => setOrders([]));
    else setOrders(loadOrders());
  }, []);

  const real = orders.filter((o) => o.kind === "order");
  const quotes = orders.filter((o) => o.kind === "quote");
  const revenue = real.reduce((s, o) => s + o.gross, 0);
  const openOrders = real.filter((o) => o.status !== "shipped").length;

  const byStatus = ORDER_FLOW.map((s) => ({ s, n: real.filter((o) => o.status === s).length }));
  const maxN = Math.max(1, ...byStatus.map((x) => x.n));
  const bySystem = (["bars", "glass"] as const).map((sys) => ({
    sys,
    v: real.filter((o) => o.system === sys).reduce((s, o) => s + o.gross, 0),
  }));
  const maxV = Math.max(1, ...bySystem.map((x) => x.v));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t.dash.revenue} value={chf(revenue)} />
        <Kpi label={t.dash.openOrders} value={String(openOrders)} />
        <Kpi label={t.dash.openQuotes} value={String(quotes.length)} />
        <Kpi label={t.dash.avgOrder} value={real.length ? chf(revenue / real.length) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 border border-hairline p-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.dash.byStatus}</span>
          {byStatus.map((x) => (
            <BarRow key={x.s} label={statusLabels[x.s]} value={x.n} max={maxN} display={String(x.n)} />
          ))}
        </div>
        <div className="flex flex-col gap-3 border border-hairline p-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.dash.bySystem}</span>
          {bySystem.map((x) => (
            <BarRow
              key={x.sys}
              label={x.sys === "glass" ? cfgDict.systemGlass : cfgDict.systemBars}
              value={x.v}
              max={maxV}
              display={chf(x.v)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col border border-hairline p-5">
        <span className="pb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.dash.recent}</span>
        {orders.slice(0, 5).map((o) => (
          <div key={o.ref} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-hairline/70 py-2">
            <span className="text-sm text-ink">{o.ref}</span>
            <span className="flex-1 text-sm font-light text-graphite">
              {o.customer.name} · {o.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars} · {o.lengthM.toLocaleString("de-CH")} m
            </span>
            <span className="text-xs font-light text-stone">{statusLabels[o.status]}</span>
            <span className="text-sm font-light text-ink">{chf(o.gross)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- orders tab ---------- */

function EventLog({ order, t, statusLabels }: { order: Order; t: AdminDict; statusLabels: Dict["portal"]["status"] }) {
  const events = hasBackend ? ((order as ApiOrder).events ?? []) : loadEvents(order.ref);
  const label = (e: OrderEvent) =>
    e.type === "created" ? t.events.created : e.type === "quote_accepted" ? t.events.quote_accepted : statusLabels[e.type];

  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.events.title}</span>
      {events.length === 0 ? (
        <p className="pt-1 text-xs font-light text-stone">{t.events.none}</p>
      ) : (
        <div className="flex flex-col pt-1">
          {events.map((e, i) => (
            <div key={i} className="border-t border-hairline/70 py-1.5 first:border-t-0">
              <p className="text-[13px] font-light text-graphite">
                <span className="pr-3 text-xs text-stone">{e.at}</span>
                {label(e)}
              </p>
              {e.emailTo && (
                <p className="pl-0 text-xs font-light text-steel">
                  ✉ {t.events.emailTo} {e.emailTo}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BomDetail({ order, t, statusLabels }: { order: Order; t: AdminDict; statusLabels: Dict["portal"]["status"] }) {
  const [types, setTypes] = useState<TypeProfile[]>([]);
  useEffect(() => {
    fetchAllTypes().then(setTypes);
  }, []);
  const tp = order.config && types.length > 0 ? resolveType(types, order.config.typeId, order.config.system) : null;
  const derived = order.config && tp ? deriveRailing(order.config, tp) : null;
  const bom = order.config && tp && derived ? buildBom(order.config, derived, tp) : null;
  const parts: Record<string, string> = t.bom.parts;

  return (
    <div className="grid gap-8 py-2 md:grid-cols-[1fr_1fr]">
      <div className="flex flex-col">
        <span className="pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.bom.title}</span>
        {!bom ? (
          <p className="text-sm font-light text-stone">{t.bom.noBom}</p>
        ) : (
          bom.map((l, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 border-t border-hairline/70 py-1.5">
              <span className="text-[13px] font-light text-graphite">
                {parts[l.id] ?? l.id}
                {l.detail && <span className="text-stone"> · {l.detail}</span>}
              </span>
              <span className="whitespace-nowrap text-[13px] font-light text-ink">
                {l.qty.toLocaleString("de-CH")} {t.bom.units[l.unit]}
              </span>
            </div>
          ))
        )}
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
        <EventLog order={order} t={t} statusLabels={statusLabels} />
      </div>
    </div>
  );
}

function OrdersTable({ t, statusLabels, cfgDict }: { t: AdminDict; statusLabels: Dict["portal"]["status"]; cfgDict: Dict["cfg"] }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<Record<string, string>>({});

  const refresh = () => {
    if (hasBackend) api.listOrders().then(setOrders).catch(() => setOrders([]));
    else setOrders(loadOrders());
  };
  useEffect(refresh, []);

  const advance = (ref: string, status: OrderStatus) => {
    if (hasBackend) {
      api.patchOrder(ref, { status }).then(refresh).catch(() => {});
      return;
    }
    updateOrderStatus(ref, status);
    setOrders(loadOrders());
  };

  const sendQuote = (o: Order) => {
    const v = Number(quoteDraft[o.ref] ?? Math.round(o.gross));
    if (!Number.isFinite(v) || v <= 0) return;
    if (hasBackend) {
      api.patchOrder(o.ref, { quotedGross: v }).then(refresh).catch(() => {});
      return;
    }
    updateOrder(o.ref, { status: "quoted", quotedGross: v });
    logEvent(o.ref, "quoted", o.customer.email);
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
                    {o.kind === "quote" ? (
                      o.status === "quote_requested" ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={quoteDraft[o.ref] ?? String(Math.round(o.gross))}
                            onChange={(e) => setQuoteDraft({ ...quoteDraft, [o.ref]: e.target.value })}
                            className="w-24 border border-hairline bg-paper px-2 py-1.5 text-xs font-light text-ink outline-none focus:border-graphite"
                          />
                          <button
                            type="button"
                            onClick={() => sendQuote(o)}
                            className="whitespace-nowrap border border-ink/40 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink"
                          >
                            {t.sendQuote}
                          </button>
                        </div>
                      ) : (
                        <span className="whitespace-nowrap text-xs font-light text-graphite">
                          {statusLabels[o.status]} · {chf(o.quotedGross ?? o.gross)}
                        </span>
                      )
                    ) : (
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
                    )}
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
                      <BomDetail order={o} t={t} statusLabels={statusLabels} />
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

/* ---------- customers tab ---------- */

function CustomersTab({ t }: { t: AdminDict }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tiers, setTiers] = useState<Record<string, Tier>>({});
  const [apiCustomers, setApiCustomers] = useState<{ name: string; city: string; email: string; orders: number; quotes: number; revenue: number; tier: Tier }[]>([]);

  const refresh = () => {
    if (hasBackend) {
      api
        .listCustomers()
        .then((cs) => {
          setApiCustomers(cs);
          setTiers(Object.fromEntries(cs.map((c) => [c.email.toLowerCase(), c.tier])));
        })
        .catch(() => setApiCustomers([]));
    } else {
      setOrders(loadOrders());
      setTiers(loadTiers());
    }
  };
  useEffect(refresh, []);

  const byEmail = new Map<string, { name: string; city: string; email: string; orders: number; quotes: number; revenue: number }>();
  orders.forEach((o) => {
    const key = o.customer.email.toLowerCase();
    const c = byEmail.get(key) ?? { name: o.customer.name, city: o.customer.city, email: o.customer.email, orders: 0, quotes: 0, revenue: 0 };
    if (o.kind === "order") {
      c.orders += 1;
      c.revenue += o.gross;
    } else {
      c.quotes += 1;
    }
    byEmail.set(key, c);
  });
  const customers = hasBackend ? apiCustomers : [...byEmail.values()].sort((a, b) => b.revenue - a.revenue);

  const assign = (email: string, tier: Tier) => {
    if (hasBackend) {
      api.setTier(email, tier).then(refresh).catch(() => {});
      return;
    }
    setTier(email, tier);
    setTiers(loadTiers());
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm font-light leading-relaxed text-graphite">{t.customers.hint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink/50">
              {[t.customers.name, t.customers.contact, t.customers.orders, t.customers.quotes, t.customers.revenue, t.customers.tier].map((h, i) => (
                <th key={i} className="py-3 pr-4 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.email} className="border-b border-hairline align-baseline">
                <td className="py-3 pr-4 text-sm text-ink">
                  {c.name}
                  <span className="block text-xs font-light text-stone">{c.city}</span>
                </td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">{c.email}</td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">{c.orders}</td>
                <td className="py-3 pr-4 text-sm font-light text-graphite">{c.quotes}</td>
                <td className="py-3 pr-4 whitespace-nowrap text-sm font-light text-ink">{chf(c.revenue)}</td>
                <td className="py-3 pr-4">
                  <select
                    value={tiers[c.email.toLowerCase()] ?? "standard"}
                    onChange={(e) => assign(c.email, e.target.value as Tier)}
                    className="border border-hairline bg-paper px-2 py-1.5 text-xs font-light text-ink outline-none focus:border-graphite"
                  >
                    {(["standard", "partner", "pro"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t.customers.tiers[v]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- pricing tab ---------- */

function PricingEditor({ t }: { t: AdminDict }) {
  const [pb, setPb] = useState<PriceBook>(defaultPriceBook);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPriceBook().then(setPb);
  }, []);

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
            publishPriceBook(pb)
              .then((next) => {
                setPb(next);
                setSaved(true);
              })
              .catch(() => {});
          }}
          className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => {
            resetPriceBookAll()
              .then((next) => {
                setPb(next);
                setSaved(false);
              })
              .catch(() => {});
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

/* ---------- products tab: parametric type designer ---------- */

function ProductsTab({ t, cfgDict }: { t: AdminDict; cfgDict: Dict["cfg"] }) {
  const [types, setTypes] = useState<TypeProfile[]>([]);
  const [designer, setDesigner] = useState<"new" | TypeProfile | null>(null);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    fetchAllTypes().then(setTypes);
  }, []);
  const refresh = () => fetchAllTypes().then(setTypes);

  const specFor = (x: TypeProfile) =>
    x.builtin
      ? x.template === "bars"
        ? t.productBarsSpec
        : t.productGlassSpec
      : x.recipe
        ? `${cfgDict.infillKinds[x.recipe.infill.kind]} · ≤ ${x.maxSlope}° · CHF ${x.basePerM}/m`
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
                    saveType({ ...x, active: !x.active }).then(refresh).catch(() => {});
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-graphite underline-offset-2 hover:text-ink hover:underline"
                >
                  {x.active ? t.typesForm.inactive : t.productsActive}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeType(x.id).then(refresh).catch(() => {});
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
              .catch(() => {});
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
    </div>
  );
}

/* ---------- content tab: references CMS ---------- */

const emptyProject: RefProject = { name: "", place: "", system: "", length: "", mounting: "", desc: "" };

function ContentTab({ t, refsDict, locale }: { t: AdminDict; refsDict: Dict["references"]; locale: string }) {
  const c = t.content;
  const [content, setContent] = useState<ContentState>({ projects: {}, added: [] });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<RefProject>(emptyProject);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchContent().then(setContent);
  }, []);

  const base = refsDict.projects as RefProject[];
  const combined: RefProject[] = [...base.map((p, i) => ({ ...p, ...(content.projects[i] ?? {}) })), ...content.added];

  const persist = (next: ContentState) => {
    putContent(next)
      .then(() => fetchContent())
      .then((c) => {
        setContent(c);
        setEditing(null);
        setSaved(true);
      })
      .catch(() => {});
  };

  const submit = () => {
    if (editing === "new") {
      persist({ ...content, added: [...content.added, draft] });
    } else if (typeof editing === "number" && editing < base.length) {
      persist({ ...content, projects: { ...content.projects, [editing]: draft } });
    } else if (typeof editing === "number") {
      const added = [...content.added];
      added[editing - base.length] = draft;
      persist({ ...content, added });
    }
  };

  const inputCls =
    "w-full border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 border border-ink/60 p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input required placeholder={c.name} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
        <input required placeholder={c.place} value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} className={inputCls} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input required placeholder={c.system} value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })} className={inputCls} />
        <input required placeholder={c.length} value={draft.length} onChange={(e) => setDraft({ ...draft, length: e.target.value })} className={inputCls} />
        <input required placeholder={c.mounting} value={draft.mounting} onChange={(e) => setDraft({ ...draft, mounting: e.target.value })} className={inputCls} />
      </div>
      <textarea
        required
        rows={2}
        placeholder={c.desc}
        value={draft.desc}
        onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
        className={inputCls}
      />
      <div className="flex gap-3">
        <button type="submit" className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite">
          {c.save}
        </button>
        <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite">
          {c.cancel}
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-2xl text-sm font-light leading-relaxed text-graphite">{c.hint}</p>
        <Link href={`/${locale}/references/`} className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline">
          {c.viewPage} →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {combined.map((p, i) =>
          editing === i ? (
            <div key={i} className="sm:col-span-2">
              {form}
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-2 border border-hairline p-5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{p.name}</span>
                {i >= base.length && (
                  <span className="border border-steel/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-steel">{c.customBadge}</span>
                )}
              </div>
              <p className="text-xs font-light text-stone">
                {p.place} · {p.system} · {p.length}
              </p>
              <p className="text-xs font-light leading-relaxed text-graphite">{p.desc}</p>
              <div className="flex gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(p);
                    setEditing(i);
                    setSaved(false);
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-graphite underline-offset-2 hover:text-ink hover:underline"
                >
                  {c.edit}
                </button>
                {i >= base.length && (
                  <button
                    type="button"
                    onClick={() => persist({ ...content, added: content.added.filter((_, j) => j !== i - base.length) })}
                    className="text-[11px] uppercase tracking-[0.12em] text-[#b04a3a] underline-offset-2 hover:underline"
                  >
                    {c.delete}
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {editing === "new" ? (
        form
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyProject);
            setEditing("new");
            setSaved(false);
          }}
          className="self-start border border-dashed border-hairline px-5 py-3 text-left text-sm text-graphite transition-colors hover:border-graphite"
        >
          + {c.addProject}
        </button>
      )}

      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {c.savedMsg}
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
  refsDict,
  locale,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  refsDict: Dict["references"];
  locale: string;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-px self-start bg-hairline">
        {(["dashboard", "orders", "customers", "pricing", "products", "content"] as const).map((v) => (
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

      {tab === "dashboard" && <DashboardTab t={t} statusLabels={statusLabels} cfgDict={cfgDict} />}
      {tab === "orders" && <OrdersTable t={t} statusLabels={statusLabels} cfgDict={cfgDict} />}
      {tab === "customers" && <CustomersTab t={t} />}
      {tab === "pricing" && <PricingEditor t={t} />}
      {tab === "products" && <ProductsTab t={t} cfgDict={cfgDict} />}
      {tab === "content" && <ContentTab t={t} refsDict={refsDict} locale={locale} />}
    </div>
  );
}
