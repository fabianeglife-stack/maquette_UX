"use client";

/*
 * Documents station: the per-order document binder. Pick an order on the left
 * and every document that belongs to it appears on the right, structured by
 * department (sales, finance, production, logistics, technical).
 *
 * In the backend build the documents are *persisted*: the first "Open" builds
 * the PDF, stores it against the order and opens it inline in a new tab; later
 * opens serve the stored bytes without regenerating. A "Regenerate" action
 * rebuilds documents that track order state (e.g. an invoice after payment).
 * The static prototype (no backend) falls back to the classic download.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { chf } from "@/lib/engine/pricing";
import { invoicesFor } from "@/lib/engine/invoicing";
import { deriveRailing } from "@/lib/engine/geometry";
import { buildBom } from "@/lib/engine/bom";
import type { TypeProfile } from "@/lib/engine/types";
import { fmt, type Dict } from "@/lib/i18n";
import {
  confirmationNoFor,
  deliveryNoFor,
  loadEvents,
  planFor,
  quoteNoFor,
  type Order,
  type OrderEvent,
  type TypePlans,
} from "@/lib/store";
import { fetchAllTypes, fetchPageContent, resolveType } from "@/lib/data";
import { hasBackend, api, type ApiOrder, type DocumentMeta } from "@/lib/api";
import { docToDataUri, type BuiltDoc } from "@/lib/pdf";
import { notify } from "@/lib/toast";
import { buildQuoteDoc } from "@/components/portal/quote";
import { confirmationSummary, buildConfirmationDoc } from "@/components/portal/confirmation";
import { buildInvoiceDoc } from "@/components/portal/invoice";
import { buildReminderDoc } from "@/components/portal/reminder";
import { buildDeliveryDoc, buildFabricationDoc, buildPickingDoc } from "./docs";
import { buildDrawingDoc } from "@/components/configurator/pdf";
import DrawingSVG from "@/components/configurator/DrawingSVG";
import { StatusChip, TabSkeleton, inputCls, useOrders, type AdminDict } from "./shared";

/** A generator producing the document bytes on demand (built, not yet saved). */
type Build = () => BuiltDoc | Promise<BuiltDoc>;

/** One binder line: a document that exists or a slot with the reason it doesn't yet. */
function DocRow({
  label,
  no,
  note,
  reason,
  savedNote,
  busy,
  openLabel,
  generatingLabel,
  regenLabel,
  onOpen,
  onRegen,
}: {
  label: string;
  no?: string;
  note?: string;
  reason?: string;
  savedNote?: string;
  busy?: boolean;
  openLabel: string;
  generatingLabel: string;
  regenLabel: string;
  onOpen?: () => void;
  onRegen?: () => void;
}) {
  const available = Boolean(onOpen);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline/70 py-2 first:border-t-0">
      <button
        type="button"
        disabled={!available || busy}
        onClick={onOpen}
        className="border border-hairline px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-graphite transition-colors hover:border-graphite hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
      >
        {busy ? generatingLabel : openLabel}
      </button>
      <span className={`text-[13px] ${available ? "text-ink" : "text-stone"}`}>{label}</span>
      {no && <span className="text-xs font-light text-stone">{no}</span>}
      {note && <span className="text-xs font-light text-steel">{note}</span>}
      {savedNote && <span className="text-[11px] font-light text-steel">· {savedNote}</span>}
      {onRegen && (
        <button
          type="button"
          onClick={onRegen}
          disabled={busy}
          title={regenLabel}
          aria-label={regenLabel}
          className="text-[13px] text-stone transition-colors hover:text-ink disabled:opacity-35"
        >
          ↻
        </button>
      )}
      {!available && reason && <span className="ml-auto text-[11px] font-light italic text-stone">{reason}</span>}
    </div>
  );
}

function Category({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col border border-hairline p-4">
      <span className="pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{title}</span>
      {children}
    </div>
  );
}

export default function DocumentsTab({
  t,
  statusLabels,
  cfgDict,
  invoiceDict,
  confirmationDict,
  quoteDict,
  reminderDict,
  locale,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  invoiceDict: Dict["portal"]["invoice"];
  confirmationDict: Dict["portal"]["confirmation"];
  quoteDict: Dict["portal"]["quote"];
  reminderDict: Dict["portal"]["reminder"];
  locale?: string;
}) {
  const { orders, ready } = useOrders();
  const [q, setQ] = useState("");
  const [selRef, setSelRef] = useState<string | null>(null);
  const [types, setTypes] = useState<TypeProfile[]>([]);
  const [typePlans, setTypePlans] = useState<TypePlans>({});
  // Persisted documents for the selected order, keyed by their stable slug.
  const [savedMap, setSavedMap] = useState<Record<string, DocumentMeta>>({});
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetchAllTypes().then(setTypes);
    fetchPageContent<TypePlans>("typeplans", {}).then(setTypePlans);
  }, []);

  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      orders
        .filter((o) => (needle === "" ? true : `${o.ref} ${o.customer.name} ${o.customer.city}`.toLowerCase().includes(needle)))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [orders, needle],
  );
  const order = orders.find((o) => o.ref === selRef) ?? null;

  // Pull the list of already-stored documents whenever the selection changes.
  useEffect(() => {
    if (!selRef || !hasBackend) {
      setSavedMap({});
      return;
    }
    let alive = true;
    api
      .listDocuments(selRef)
      .then((docs) => {
        if (alive) setSavedMap(Object.fromEntries(docs.map((d) => [d.slug, d])));
      })
      .catch(() => {
        if (alive) setSavedMap({});
      });
    return () => {
      alive = false;
    };
  }, [selRef]);

  // Engine output for the selected order's technical documents.
  const tp = useMemo(
    () => (order?.config && types.length > 0 ? resolveType(types, order.config.typeId, order.config.system) : null),
    [order, types],
  );
  const derived = useMemo(() => (order?.config && tp ? deriveRailing(order.config, tp) : null), [order, tp]);
  const bom = useMemo(() => (order?.config && tp && derived ? buildBom(order.config, derived, tp) : null), [order, tp, derived]);
  const systemName = order ? (order.system === "glass" ? cfgDict.systemGlass : cfgDict.systemBars) : "";
  const typeName =
    tp?.name?.[locale as "de" | "fr" | "en"] ?? tp?.name?.de ?? systemName;

  // Open a document: serve the stored copy when present, otherwise build it,
  // persist it and open the stored bytes. In the static build (no backend) the
  // document is simply downloaded, as before.
  async function runOpen(slug: string, area: string, kind: string, no: string | undefined, build: Build, force: boolean) {
    if (!order) return;
    if (!hasBackend) {
      const { doc, filename } = await build();
      doc.save(filename);
      return;
    }
    const existing = savedMap[slug];
    if (existing && !force) {
      window.open(api.documentUrl(existing.id), "_blank", "noopener");
      return;
    }
    // Reserve the tab during the click gesture so the async build doesn't trip
    // the pop-up blocker; point it at the stored bytes once saved.
    const win = window.open("", "_blank");
    setBusySlug(slug);
    try {
      const { doc, filename } = await build();
      const meta = await api.saveDocument(order.ref, { slug, area, kind, no, filename, dataUri: docToDataUri(doc) });
      const url = api.documentUrl(meta.id);
      if (win) win.location.href = url;
      else window.open(url, "_blank", "noopener");
      setSavedMap((m) => ({ ...m, [slug]: meta }));
    } catch {
      if (win) win.close();
      notify("loadFailed", t.docsHub.openError);
    } finally {
      setBusySlug(null);
    }
  }

  // Common props for a binder line: wires open + regenerate and the stored note.
  const rowProps = (slug: string, area: string, kind: string, no: string | undefined, build: Build | undefined) => {
    const meta = savedMap[slug];
    return {
      openLabel: t.docsHub.open,
      generatingLabel: t.docsHub.generating,
      regenLabel: t.docsHub.regenerate,
      busy: busySlug === slug,
      savedNote: meta ? fmt(t.docsHub.savedOn, { date: meta.createdAt.slice(0, 10) }) : undefined,
      onOpen: build ? () => runOpen(slug, area, kind, no, build, false) : undefined,
      onRegen: hasBackend && build && meta ? () => runOpen(slug, area, kind, no, build, true) : undefined,
    };
  };

  if (!ready) return <TabSkeleton />;

  const events: OrderEvent[] = order ? (hasBackend ? ((order as ApiOrder).events ?? []) : loadEvents(order.ref)) : [];
  const instalments = order ? invoicesFor(order, events) : [];
  const plan = order?.config ? planFor(typePlans, tp?.id ?? order.config.typeId ?? "", order.config.substrate ?? "concrete_top", order.config.mounting, tp?.planUrl) : undefined;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* order picker */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        <p className="text-sm font-light leading-relaxed text-graphite">{t.docsHub.hint}</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.docsHub.search} className={inputCls} />
        <div className="flex max-h-[30vh] flex-col overflow-y-auto border border-hairline lg:max-h-[calc(100vh-220px)]">
          {list.length === 0 ? (
            <p className="p-4 text-sm font-light text-stone">{t.docsHub.empty}</p>
          ) : (
            list.map((o) => (
              <button
                key={o.ref}
                type="button"
                onClick={() => setSelRef(o.ref)}
                className={`flex flex-col gap-1 border-b border-hairline/70 px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                  selRef === o.ref ? "bg-mist/70" : "hover:bg-mist/40"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink">{o.ref}</span>
                  <StatusChip status={o.status} label={statusLabels[o.status]} />
                </span>
                <span className="truncate text-xs font-light text-stone">
                  {o.customer.name} · {o.createdAt} · {chf(o.quotedGross ?? o.gross)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* binder */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {!order ? (
          <p className="border border-dashed border-hairline p-10 text-center text-sm font-light text-stone">{t.docsHub.select}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-base text-ink">
                {order.ref} <span className="text-sm font-light text-stone">· {order.customer.name}</span>
              </span>
              <StatusChip status={order.status} label={statusLabels[order.status]} />
            </div>

            {/* sales */}
            <Category title={t.docsHub.sale}>
              <DocRow
                label={quoteDict.title}
                no={quoteNoFor(order.ref)}
                note={order.validUntil ? `${quoteDict.validUntil} ${order.validUntil}` : undefined}
                {...rowProps("quote", "sale", quoteDict.title, quoteNoFor(order.ref), () => buildQuoteDoc(order, quoteDict, systemName))}
              />
              <DocRow
                label={t.docs.confirmation}
                no={confirmationNoFor(order.ref)}
                reason={t.docsHub.needConfirm}
                {...rowProps(
                  "confirmation",
                  "sale",
                  t.docs.confirmation,
                  confirmationNoFor(order.ref),
                  order.kind === "order" && order.deliveryDate
                    ? () =>
                        buildConfirmationDoc(order, confirmationDict, cfgDict.payTerms, systemName, {
                          svg: svgRef.current,
                          summary: confirmationSummary(order, cfgDict, typeName),
                        })
                    : undefined,
                )}
              />
            </Category>

            {/* finance */}
            {order.kind === "order" && (
              <Category title={t.docsHub.finance}>
                {instalments.length === 0 && <p className="text-xs font-light text-stone">{t.docsHub.noneYet}</p>}
                {instalments.map((inv) => (
                  <DocRow
                    key={inv.kind}
                    label={t.finance.types[inv.kind]}
                    no={inv.no}
                    note={inv.paidAt ? fmt(t.docsHub.paidOn, { date: inv.paidAt }) : inv.dueDate ? `${t.finance.colDue} ${inv.dueDate}` : undefined}
                    reason={t.docsHub.needShipped}
                    {...rowProps(
                      `invoice-${inv.kind}`,
                      "finance",
                      t.finance.types[inv.kind],
                      inv.no,
                      inv.state !== "pending" ? () => buildInvoiceDoc(order, invoiceDict, systemName, inv) : undefined,
                    )}
                  />
                ))}
                {instalments.flatMap((inv) =>
                  inv.reminders.map((date, i) => {
                    const level = Math.min(i + 1, 3) as 1 | 2 | 3;
                    return (
                      <DocRow
                        key={`${inv.kind}-r${i}`}
                        label={t.finance.reminderLevels[level]}
                        no={inv.no}
                        note={date}
                        {...rowProps(`reminder-${inv.kind}-${i + 1}`, "finance", t.finance.reminderLevels[level], inv.no, () =>
                          buildReminderDoc(order, inv, level, date, reminderDict),
                        )}
                      />
                    );
                  }),
                )}
              </Category>
            )}

            {/* production */}
            {order.kind === "order" && (
              <Category title={t.docsHub.production}>
                <DocRow
                  label={t.docs.fabrication}
                  reason={t.docs.needConfig}
                  {...rowProps(
                    "fabrication",
                    "production",
                    t.docs.fabrication,
                    undefined,
                    order.config && tp && derived && bom
                      ? () => buildFabricationDoc(order, order.config!, tp, derived, bom, typeName, t.docs, t.bom, cfgDict, svgRef.current)
                      : undefined,
                  )}
                />
                <DocRow
                  label={t.docs.picking}
                  reason={t.docs.needConfig}
                  {...rowProps("picking", "production", t.docs.picking, undefined, derived && bom ? () => buildPickingDoc(order, derived, bom, t.docs, t.bom) : undefined)}
                />
              </Category>
            )}

            {/* logistics */}
            {order.kind === "order" && (
              <Category title={t.docsHub.logistics}>
                <DocRow
                  label={t.docs.delivery}
                  no={deliveryNoFor(order.ref)}
                  {...rowProps("delivery", "logistics", t.docs.delivery, deliveryNoFor(order.ref), () => buildDeliveryDoc(order, typeName, t.docs, derived))}
                />
              </Category>
            )}

            {/* technical */}
            <Category title={t.docsHub.technical}>
              <DocRow
                label={cfgDict.downloadPdf}
                reason={t.docs.needConfig}
                {...rowProps("drawing", "technical", cfgDict.downloadPdf, undefined, order.config && derived
                  ? async () => {
                      const doc = await buildDrawingDoc(svgRef.current!);
                      return { doc, filename: `axioform-${order.ref}.pdf` };
                    }
                  : undefined)}
              />
              {plan ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline/70 py-2">
                  <a
                    href={plan.startsWith("data:") ? plan : `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${plan}`}
                    {...(plan.startsWith("data:") ? { download: `axioform-plan-${order.ref}.pdf` } : { target: "_blank", rel: "noopener" })}
                    className="border border-hairline px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-graphite transition-colors hover:border-graphite hover:text-ink"
                  >
                    {t.docsHub.open}
                  </a>
                  <span className="text-[13px] text-ink">{cfgDict.planPdf}</span>
                </div>
              ) : (
                <DocRow
                  label={cfgDict.planPdf}
                  reason={t.docsHub.noPlan}
                  openLabel={t.docsHub.open}
                  generatingLabel={t.docsHub.generating}
                  regenLabel={t.docsHub.regenerate}
                />
              )}
            </Category>

            {/* offscreen principle drawing feeding the PDFs above */}
            {order.config && derived && tp && (
              <div className="hidden" aria-hidden>
                <DrawingSVG
                  ref={svgRef}
                  cfg={order.config}
                  derived={derived}
                  labels={cfgDict.drawing}
                  refNo={order.ref}
                  tp={tp}
                  locale={locale}
                  typeName={typeName}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
