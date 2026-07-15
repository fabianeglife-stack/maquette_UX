"use client";

/*
 * Collaborator management (admin only): create company accounts and grant
 * each one its stations. In the static prototype the roster lives in
 * localStorage so the workflow is demonstrable without a backend.
 */

import { useEffect, useState } from "react";
import { api, hasBackend, type AuditRow, type StaffRow } from "@/lib/api";
import { loadStaff, saveStaffMember } from "@/lib/store";
import { notify } from "@/lib/toast";
import { inputCls, TabSkeleton, type AdminDict } from "./shared";

/** Grantable stations, labelled via the existing tab names. ERP stations plus
 *  the Studio stations (site & configurator management). */
const AREAS = ["dashboard", "orders", "invoices", "production", "logistics", "customers", "products", "pricing", "content"] as const;

const emptyDraft = { name: "", email: "", password: "", role: "staff" as "staff" | "admin", access: [] as string[] };

export default function StaffTab({ t }: { t: AdminDict }) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");

  const refresh = () => {
    if (hasBackend) {
      api
        .listStaff()
        .then((r) => {
          setStaff(r.staff);
          setAudit(r.audit);
        })
        .catch(() => {
          setStaff([]);
          notify("loadFailed");
        })
        .finally(() => setReady(true));
    } else {
      setStaff(loadStaff());
      setReady(true);
    }
  };
  useEffect(refresh, []);

  if (!ready) return <TabSkeleton />;

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const toggleArea = (member: StaffRow, area: string) => {
    const access = member.access.includes(area) ? member.access.filter((a) => a !== area) : [...member.access, area];
    if (hasBackend) {
      api
        .patchStaff(member.email, { access })
        .then(() => {
          refresh();
          flash();
        })
        .catch(() => notify("saveFailed"));
    } else {
      saveStaffMember({ ...member, access });
      refresh();
      flash();
    }
  };

  const setRole = (member: StaffRow, role: "staff" | "admin") => {
    if (hasBackend) {
      api
        .patchStaff(member.email, { role })
        .then(() => {
          refresh();
          flash();
        })
        .catch(() => notify("saveFailed"));
    } else {
      saveStaffMember({ ...member, role });
      refresh();
      flash();
    }
  };

  const setActive = (member: StaffRow, active: boolean) => {
    if (hasBackend) {
      api
        .patchStaff(member.email, { active })
        .then(() => {
          refresh();
          flash();
        })
        .catch(() => notify("saveFailed"));
    } else {
      saveStaffMember({ ...member, active });
      refresh();
      flash();
    }
  };

  const resetPassword = (member: StaffRow) => {
    api
      .patchStaff(member.email, { password: newPw })
      .then(() => {
        setResetFor(null);
        setNewPw("");
        refresh();
        flash();
      })
      .catch(() => notify("saveFailed"));
  };

  const create = () => {
    if (hasBackend) {
      api
        .createStaff(draft)
        .then(() => {
          setDraft(emptyDraft);
          setCreating(false);
          refresh();
          flash();
        })
        .catch(() => notify("saveFailed"));
    } else {
      saveStaffMember({ email: draft.email, name: draft.name, role: draft.role, access: draft.access, active: true });
      setDraft(emptyDraft);
      setCreating(false);
      refresh();
      flash();
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="max-w-2xl text-sm font-light leading-relaxed text-graphite">{t.staff.hint}</p>
        {saved && (
          <span role="status" className="text-[11px] font-light text-steel">
            {t.plans.saved}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {staff.map((m) => (
          <div key={m.email} className={`flex flex-col gap-3 border border-hairline p-4 ${m.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="min-w-[140px] text-sm text-ink">
                {m.name}
                <span className="block text-xs font-light text-stone">{m.email}</span>
              </span>
              {!m.active && (
                <span className="border border-alert/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-alert">
                  {t.staff.disabled}
                </span>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <select
                  value={m.role}
                  onChange={(e) => setRole(m, e.target.value as "staff" | "admin")}
                  className="border border-hairline bg-paper px-2 py-1.5 text-xs font-light text-ink outline-none focus:border-graphite"
                >
                  <option value="staff">{t.staff.roleStaff}</option>
                  <option value="admin">{t.staff.roleAdmin}</option>
                </select>
                {hasBackend && m.active && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetFor(resetFor === m.email ? null : m.email);
                      setNewPw("");
                    }}
                    className="text-[11px] uppercase tracking-[0.12em] text-graphite underline-offset-2 hover:text-ink hover:underline"
                  >
                    {t.staff.reset}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActive(m, !m.active)}
                  className={`text-[11px] uppercase tracking-[0.12em] underline-offset-2 hover:underline ${
                    m.active ? "text-alert" : "text-ink"
                  }`}
                >
                  {m.active ? t.staff.disable : t.staff.enable}
                </button>
              </div>
            </div>
            {resetFor === m.email && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  resetPassword(m);
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  required
                  type="password"
                  minLength={8}
                  autoFocus
                  placeholder={t.staff.newPassword}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className={`${inputCls} max-w-xs`}
                />
                <button type="submit" className="text-xs uppercase tracking-[0.14em] text-ink underline underline-offset-4">
                  {t.staff.apply}
                </button>
              </form>
            )}
            {m.role === "staff" && (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {AREAS.map((a) => (
                  <label key={a} className="flex items-center gap-2 text-[13px] font-light text-graphite">
                    <input
                      type="checkbox"
                      checked={m.access.includes(a)}
                      onChange={() => toggleArea(m, a)}
                      className="h-4 w-4 accent-[#171716]"
                    />
                    {t.tabs[a]}
                  </label>
                ))}
              </div>
            )}
            {m.role === "staff" && m.access.length === 0 && (
              <p className="text-xs font-light text-alert">{t.staff.noAccess}</p>
            )}
          </div>
        ))}
      </div>

      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="flex flex-col gap-3 border border-ink/60 p-5"
        >
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-ink">{t.staff.create}</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <input required placeholder={t.staff.name} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
            <input required type="email" placeholder={t.staff.email} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} />
          </div>
          {hasBackend && (
            <input
              required
              type="password"
              minLength={8}
              placeholder={t.staff.password}
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              className={inputCls}
            />
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {AREAS.map((a) => (
              <label key={a} className="flex items-center gap-2 text-[13px] font-light text-graphite">
                <input
                  type="checkbox"
                  checked={draft.access.includes(a)}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      access: draft.access.includes(a) ? draft.access.filter((x) => x !== a) : [...draft.access, a],
                    })
                  }
                  className="h-4 w-4 accent-[#171716]"
                />
                {t.tabs[a]}
              </label>
            ))}
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite">
              {t.staff.create}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite"
            >
              {t.content.cancel}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="self-start border border-dashed border-hairline px-5 py-3 text-left text-sm text-graphite transition-colors hover:border-graphite"
        >
          + {t.staff.create}
        </button>
      )}

      {/* access-rights trail (server mode) */}
      {hasBackend && audit.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-ink/50 pt-4">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">{t.staff.audit}</span>
          <ol className="flex flex-col">
            {audit.map((e, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${i === 0 ? "bg-ink" : "bg-stone"}`} />
                  {i < audit.length - 1 && <span className="w-px flex-1 bg-hairline" />}
                </div>
                <div className="pb-3">
                  <p className="text-[13px] font-light text-graphite">
                    {t.staff.auditActions[e.action as keyof typeof t.staff.auditActions] ?? e.action}
                    {" — "}
                    <span className="text-ink">{e.target}</span>
                    {e.detail && <span className="text-stone"> · {e.detail}</span>}
                  </p>
                  <p className="text-xs text-stone">
                    {e.at} · {e.actor}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
