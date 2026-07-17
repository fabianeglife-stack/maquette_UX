"use client";

/*
 * Company back-office shell, rendered as one of two full-screen consoles:
 *   - "erp"    — the operational business system (control, sales, finance,
 *                operations);
 *   - "studio" — site & configurator management (guardrail types, price book,
 *                website content).
 * Both share this shell: the access gate, the sidebar, the console switcher
 * and the lazy tab dispatch. A shared "settings" group (staff & access rights)
 * is admin-only and appears in both. Staff accounts only see the stations they
 * were granted, so a content editor can be given the Studio alone.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/store";
import type { Dict } from "@/lib/i18n";
import { api, hasBackend, type SessionInfo } from "@/lib/api";
import { NavIcon, TabSkeleton, type AdminDict } from "./shared";

type Tab = "dashboard" | "orders" | "invoices" | "documents" | "production" | "logistics" | "customers" | "pricing" | "products" | "content" | "staff";
export type Console = "erp" | "studio";

/** Stations owned by each console (settings/staff is shared, admin-only). */
const ERP_TABS: Tab[] = ["dashboard", "orders", "customers", "invoices", "documents", "production", "logistics"];
const STUDIO_TABS: Tab[] = ["products", "pricing", "content"];

/** Reserved to admins regardless of area grants (the shared settings group). */
const ADMIN_ONLY: Tab[] = ["staff"];

// next/dynamic requires inline object literals (statically analyzed).
const DashboardTab = dynamic(() => import("./DashboardTab"), { loading: () => <TabSkeleton /> });
const OrdersTab = dynamic(() => import("./OrdersTab"), { loading: () => <TabSkeleton /> });
const OpsView = dynamic(() => import("./OpsView"), { loading: () => <TabSkeleton /> });
const FinanceTab = dynamic(() => import("./FinanceTab"), { loading: () => <TabSkeleton /> });
const DocumentsTab = dynamic(() => import("./DocumentsTab"), { loading: () => <TabSkeleton /> });
const CustomersTab = dynamic(() => import("./CustomersTab"), { loading: () => <TabSkeleton /> });
const PricingTab = dynamic(() => import("./PricingTab"), { loading: () => <TabSkeleton /> });
const ProductsTab = dynamic(() => import("./ProductsTab"), { loading: () => <TabSkeleton /> });
const ContentTab = dynamic(() => import("./ContentTab"), { loading: () => <TabSkeleton /> });
const StaffTab = dynamic(() => import("./StaffTab"), { loading: () => <TabSkeleton /> });

export default function AdminApp({
  variant,
  t,
  statusLabels,
  cfgDict,
  refsDict,
  aboutDict,
  invoiceDict,
  confirmationDict,
  quoteDict,
  reminderDict,
  locale,
}: {
  variant: Console;
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  refsDict: Dict["references"];
  aboutDict: Dict["about"];
  invoiceDict: Dict["portal"]["invoice"];
  confirmationDict: Dict["portal"]["confirmation"];
  quoteDict: Dict["portal"]["quote"];
  reminderDict: Dict["portal"]["reminder"];
  locale: string;
}) {
  const consoleTabs = variant === "erp" ? ERP_TABS : STUDIO_TABS;
  const [tab, setTab] = useState<Tab>(consoleTabs[0]);

  // Access gate. The server session carries a role + area grants: admins get
  // everything, staff get their stations, customers are refused. "wrongConsole"
  // means a staff member is signed in but has no station in this console (yet
  // may have access to the other). The static prototype has no role, so a
  // signed-in visitor sees the full demo.
  const [gate, setGate] = useState<"loading" | "ok" | "anon" | "forbidden" | "wrongConsole">("loading");
  const [session, setSess] = useState<SessionInfo | null>(null);
  useEffect(() => {
    let alive = true;
    if (hasBackend) {
      api
        .me()
        .then((u) => {
          if (!alive) return;
          setSess(u);
          if (!u) return setGate("anon");
          const company = u.role === "admin" || (u.role === "staff" && (u.access?.length ?? 0) > 0);
          if (!company) return setGate("forbidden");
          const canThis = u.role === "admin" || consoleTabs.some((v) => u.access?.includes(v));
          setGate(canThis ? "ok" : "wrongConsole");
        })
        .catch(() => alive && setGate("anon"));
    } else {
      setGate(getSession() ? "ok" : "anon");
    }
    return () => {
      alive = false;
    };
  }, [consoleTabs]);

  // Which tabs this account may open. Static demo: everything.
  const allowed = (v: Tab): boolean => {
    if (!hasBackend || session?.role === "admin") return true;
    if (ADMIN_ONLY.includes(v)) return false;
    return session?.access?.includes(v) ?? false;
  };
  const canConsole = (c: Console): boolean => {
    if (!hasBackend || session?.role === "admin") return true;
    const tabs = c === "erp" ? ERP_TABS : STUDIO_TABS;
    return tabs.some((v) => session?.access?.includes(v));
  };

  // Land on the first permitted station in this console once the gate resolves.
  useEffect(() => {
    if (gate !== "ok" || allowed(tab)) return;
    const first = [...consoleTabs, "staff" as Tab].find(allowed);
    if (first) setTab(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, session]);

  if (gate !== "ok") {
    // Where a wrong-console staff member can actually go.
    const other: Console = variant === "erp" ? "studio" : "erp";
    const otherHref = `/${locale}/${other === "erp" ? "admin" : "studio"}/`;
    const otherLabel = other === "erp" ? t.erp.consoleErp : t.erp.consoleStudio;
    return (
      <div className="flex h-full items-center justify-center p-8">
        {gate === "loading" ? (
          <div className="h-6 w-40 animate-pulse rounded bg-mist" aria-busy="true" aria-label="…" />
        ) : (
          <div className="flex flex-col items-start gap-5">
            <p className="text-sm font-light text-graphite">
              {gate === "anon" ? t.gate.needLogin : gate === "wrongConsole" ? t.gate.wrongConsole : t.gate.forbidden}
            </p>
            {gate === "anon" ? (
              <Link
                href={`/${locale}/login/`}
                className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
              >
                {t.gate.toLogin}
              </Link>
            ) : gate === "wrongConsole" && canConsole(other) ? (
              <Link
                href={otherHref}
                className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
              >
                {t.gate.goTo} {otherLabel}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const erpGroups: { label: string; items: { v: Tab; icon: string }[] }[] = [
    { label: t.erp.control, items: [{ v: "dashboard", icon: "dashboard" }] },
    { label: t.erp.sales, items: [{ v: "orders", icon: "orders" }, { v: "customers", icon: "customers" }] },
    { label: t.erp.finance, items: [{ v: "invoices", icon: "invoices" }] },
    { label: t.erp.docs, items: [{ v: "documents", icon: "docs" }] },
    { label: t.erp.operations, items: [{ v: "production", icon: "production" }, { v: "logistics", icon: "logistics" }] },
  ];
  const studioGroups: { label: string; items: { v: Tab; icon: string }[] }[] = [
    { label: t.erp.studio, items: [{ v: "products", icon: "products" }, { v: "pricing", icon: "pricing" }, { v: "content", icon: "content" }] },
  ];
  const settingsGroup = { label: t.erp.settings, items: [{ v: "staff" as Tab, icon: "customers" }] };
  const allGroups = [...(variant === "erp" ? erpGroups : studioGroups), settingsGroup];
  // A collaborator only sees the stations they were granted.
  const groups = allGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.v)) }))
    .filter((g) => g.items.length > 0);

  const brand = variant === "erp" ? t.erp.consoleErp : t.erp.consoleStudio;
  const brandHue = variant === "erp" ? "#2563eb" : "#7c3aed";
  const showSwitch = canConsole("erp") && canConsole("studio");
  const switchLink = (c: Console) => {
    const active = c === variant;
    const href = `/${locale}/${c === "erp" ? "admin" : "studio"}/`;
    const label = c === "erp" ? t.erp.consoleErp : t.erp.consoleStudio;
    return (
      <Link
        key={c}
        href={href}
        className={`flex-1 rounded px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
          active ? "bg-[#2b3342] text-white" : "text-[#9aa1ac] hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#f3f4f6] md:flex-row">
      {/* sidebar — a compact top bar with a horizontally scrolling tab row on
          mobile, the full vertical rail from md: up. The workspace below is
          the only scrolling region, so the console stays usable on phones. */}
      <aside className="flex w-full shrink-0 flex-col gap-3 bg-[#151a23] px-3 py-3 md:h-full md:w-56 md:gap-5 md:overflow-y-auto md:py-5">
        <div className="flex flex-row items-center justify-between gap-2 px-1 md:flex-col md:items-stretch md:gap-2 md:px-3">
          <Link href={`/${locale}/`} className="whitespace-nowrap text-[13px] font-semibold tracking-[0.18em] text-white transition-opacity hover:opacity-80">
            AXIOFORM <span className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em] text-white" style={{ background: brandHue }}>{brand}</span>
          </Link>
          {showSwitch && (
            <div className="flex shrink-0 gap-0.5 rounded-md bg-[#0f131b] p-0.5">
              {switchLink("erp")}
              {switchLink("studio")}
            </div>
          )}
        </div>
        <nav className="flex flex-row gap-1 overflow-x-auto pb-1 md:flex-col md:gap-4 md:overflow-visible md:pb-0">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-row gap-1 md:flex-col md:gap-0.5">
              <span className="hidden px-3 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#5c6472] md:block">{g.label}</span>
              {g.items.map(({ v, icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTab(v)}
                  className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-[12.5px] transition-colors ${
                    tab === v ? "bg-[#242b38] font-medium text-white" : "text-[#9aa1ac] hover:bg-[#1c2230] hover:text-white"
                  }`}
                >
                  <span style={tab === v ? { color: "#60a5fa" } : undefined}>
                    <NavIcon name={icon} />
                  </span>
                  {t.tabs[v]}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* workspace — the only scrolling region in the full-screen console */}
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
        {tab === "dashboard" && <DashboardTab t={t} statusLabels={statusLabels} cfgDict={cfgDict} />}
        {tab === "orders" && <OrdersTab t={t} statusLabels={statusLabels} cfgDict={cfgDict} invoiceDict={invoiceDict} confirmationDict={confirmationDict} quoteDict={quoteDict} locale={locale} />}
        {tab === "production" && (
          <OpsView
            t={t}
            statusLabels={statusLabels}
            cfgDict={cfgDict}
            invoiceDict={invoiceDict}
            confirmationDict={confirmationDict}
            quoteDict={quoteDict}
            locale={locale}
            statuses={["new", "confirmed", "production"]}
            accent="#ea580c"
            hint={t.ops.productionHint}
          />
        )}
        {tab === "logistics" && (
          <OpsView
            t={t}
            statusLabels={statusLabels}
            cfgDict={cfgDict}
            invoiceDict={invoiceDict}
            confirmationDict={confirmationDict}
            quoteDict={quoteDict}
            locale={locale}
            statuses={["confirmed", "production", "shipped"]}
            accent="#0d9488"
            hint={t.ops.logisticsHint}
          />
        )}
        {tab === "invoices" && (
          <FinanceTab
            t={t}
            statusLabels={statusLabels}
            cfgDict={cfgDict}
            invoiceDict={invoiceDict}
            confirmationDict={confirmationDict}
            quoteDict={quoteDict}
            reminderDict={reminderDict}
            locale={locale}
          />
        )}
        {tab === "documents" && (
          <DocumentsTab
            t={t}
            statusLabels={statusLabels}
            cfgDict={cfgDict}
            invoiceDict={invoiceDict}
            confirmationDict={confirmationDict}
            quoteDict={quoteDict}
            reminderDict={reminderDict}
            locale={locale}
          />
        )}
        {tab === "customers" && <CustomersTab t={t} statusLabels={statusLabels} cfgDict={cfgDict} />}
        {tab === "pricing" && <PricingTab t={t} />}
        {tab === "products" && <ProductsTab t={t} cfgDict={cfgDict} />}
        {tab === "content" && <ContentTab t={t} refsDict={refsDict} aboutDict={aboutDict} locale={locale} />}
        {tab === "staff" && <StaffTab t={t} />}
      </main>
    </div>
  );
}
