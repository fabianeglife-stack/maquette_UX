"use client";

/*
 * Company-portal shell: access gate, sidebar navigation and lazy tab dispatch.
 * Staff accounts only see the stations granted in their access list; admins
 * see everything plus the administration group (catalog, content, staff).
 * Each tab lives in its own module and is code-split via next/dynamic, so a
 * station only pays for the view it opens (the type designer's 3D chunk, for
 * instance, loads only with the products tab).
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/store";
import type { Dict } from "@/lib/i18n";
import { api, hasBackend, type SessionInfo } from "@/lib/api";
import { NavIcon, TabSkeleton, type AdminDict } from "./shared";

type Tab = "dashboard" | "orders" | "invoices" | "production" | "logistics" | "customers" | "pricing" | "products" | "content" | "staff";

/** The administration group is reserved to admins regardless of area grants. */
const ADMIN_ONLY: Tab[] = ["products", "pricing", "content", "staff"];

// next/dynamic requires inline object literals (statically analyzed).
const DashboardTab = dynamic(() => import("./DashboardTab"), { loading: () => <TabSkeleton /> });
const OrdersTab = dynamic(() => import("./OrdersTab"), { loading: () => <TabSkeleton /> });
const OpsView = dynamic(() => import("./OpsView"), { loading: () => <TabSkeleton /> });
const CustomersTab = dynamic(() => import("./CustomersTab"), { loading: () => <TabSkeleton /> });
const PricingTab = dynamic(() => import("./PricingTab"), { loading: () => <TabSkeleton /> });
const ProductsTab = dynamic(() => import("./ProductsTab"), { loading: () => <TabSkeleton /> });
const ContentTab = dynamic(() => import("./ContentTab"), { loading: () => <TabSkeleton /> });
const StaffTab = dynamic(() => import("./StaffTab"), { loading: () => <TabSkeleton /> });

export default function AdminApp({
  t,
  statusLabels,
  cfgDict,
  refsDict,
  aboutDict,
  invoiceDict,
  locale,
}: {
  t: AdminDict;
  statusLabels: Dict["portal"]["status"];
  cfgDict: Dict["cfg"];
  refsDict: Dict["references"];
  aboutDict: Dict["about"];
  invoiceDict: Dict["portal"]["invoice"];
  locale: string;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");

  // Access gate. In the server build the session carries a role + area grants:
  // admins get everything, staff get their stations, customers are refused. In
  // the static prototype the local session has no role, so a signed-in visitor
  // sees the full demo portal.
  const [gate, setGate] = useState<"loading" | "ok" | "anon" | "forbidden">("loading");
  const [session, setSess] = useState<SessionInfo | null>(null);
  useEffect(() => {
    let alive = true;
    if (hasBackend) {
      api
        .me()
        .then((u) => {
          if (!alive) return;
          setSess(u);
          const company = u && (u.role === "admin" || (u.role === "staff" && (u.access?.length ?? 0) > 0));
          setGate(!u ? "anon" : company ? "ok" : "forbidden");
        })
        .catch(() => alive && setGate("anon"));
    } else {
      setGate(getSession() ? "ok" : "anon");
    }
    return () => {
      alive = false;
    };
  }, []);

  // Which tabs this account may open. Static demo: everything.
  const allowed = (v: Tab): boolean => {
    if (!hasBackend || session?.role === "admin") return true;
    if (ADMIN_ONLY.includes(v)) return false;
    return session?.access?.includes(v) ?? false;
  };

  // Land on the first permitted station once the gate resolves.
  useEffect(() => {
    if (gate !== "ok" || allowed(tab)) return;
    const order: Tab[] = ["dashboard", "orders", "invoices", "production", "logistics", "customers", "products", "pricing", "content"];
    const first = order.find(allowed);
    if (first) setTab(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, session]);

  if (gate !== "ok") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        {gate === "loading" ? (
          <div className="h-6 w-40 animate-pulse rounded bg-mist" aria-busy="true" aria-label="…" />
        ) : (
          <div className="flex flex-col items-start gap-5">
            <p className="text-sm font-light text-graphite">
              {gate === "forbidden" ? t.gate.forbidden : t.gate.needLogin}
            </p>
            {gate === "anon" && (
              <Link
                href={`/${locale}/login/`}
                className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
              >
                {t.gate.toLogin}
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  const allGroups: { label: string; items: { v: Tab; icon: string }[] }[] = [
    { label: t.erp.control, items: [{ v: "dashboard", icon: "dashboard" }] },
    {
      label: t.erp.sales,
      items: [
        { v: "orders", icon: "orders" },
        { v: "invoices", icon: "invoices" },
        { v: "customers", icon: "customers" },
      ],
    },
    {
      label: t.erp.operations,
      items: [
        { v: "production", icon: "production" },
        { v: "logistics", icon: "logistics" },
      ],
    },
    {
      label: t.erp.catalog,
      items: [
        { v: "products", icon: "products" },
        { v: "pricing", icon: "pricing" },
        { v: "content", icon: "content" },
        { v: "staff", icon: "customers" },
      ],
    },
  ];
  // A collaborator only sees the stations they were granted.
  const groups = allGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.v)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#f3f4f6] md:flex-row">
      {/* ERP sidebar */}
      <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto bg-[#151a23] px-3 py-5 md:w-56">
        <Link href={`/${locale}/`} className="px-3 text-[13px] font-semibold tracking-[0.18em] text-white transition-opacity hover:opacity-80">
          AXIOFORM <span className="rounded bg-[#2563eb] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.1em]">ERP</span>
        </Link>
        <nav className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <span className="px-3 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#5c6472]">{g.label}</span>
              {g.items.map(({ v, icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTab(v)}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12.5px] transition-colors ${
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
        {tab === "orders" && <OrdersTab t={t} statusLabels={statusLabels} cfgDict={cfgDict} invoiceDict={invoiceDict} locale={locale} />}
        {tab === "production" && (
          <OpsView
            t={t}
            statusLabels={statusLabels}
            cfgDict={cfgDict}
            invoiceDict={invoiceDict}
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
            locale={locale}
            statuses={["confirmed", "production", "shipped"]}
            accent="#0d9488"
            hint={t.ops.logisticsHint}
          />
        )}
        {tab === "invoices" && (
          <OpsView
            t={t}
            statusLabels={statusLabels}
            cfgDict={cfgDict}
            invoiceDict={invoiceDict}
            locale={locale}
            statuses={["shipped", "invoiced", "paid"]}
            accent="#4f46e5"
            hint={t.ops.invoicesHint}
          />
        )}
        {tab === "customers" && <CustomersTab t={t} />}
        {tab === "pricing" && <PricingTab t={t} />}
        {tab === "products" && <ProductsTab t={t} cfgDict={cfgDict} />}
        {tab === "content" && <ContentTab t={t} refsDict={refsDict} aboutDict={aboutDict} locale={locale} />}
        {tab === "staff" && <StaffTab t={t} />}
      </main>
    </div>
  );
}
