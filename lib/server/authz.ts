/*
 * Company-portal authorization. Staff accounts carry a JSON list of areas
 * (one per ERP station/tab); admins have every area plus the administration
 * section. Pure module — no DB import — so the rules are unit-testable.
 */

export const AREAS = [
  "dashboard",
  "orders",
  "invoices",
  "documents",
  "production",
  "logistics",
  "customers",
  "products",
  "pricing",
  "content",
] as const;

export type Area = (typeof AREAS)[number];

export function isArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v);
}

/** Parse a stored access blob into a clean list of known areas. */
export function parseAccess(raw: string | null | undefined): Area[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(isArea) : [];
  } catch {
    return [];
  }
}

/** Whether an account may use a company-portal area. */
export function hasArea(user: { role: string; access?: string | null } | null | undefined, area: Area): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "staff") return false;
  return parseAccess(user.access).includes(area);
}

/** Any company-portal access at all (staff with ≥1 area, or admin). */
export function isCompany(user: { role: string; access?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.role === "staff" && parseAccess(user.access).length > 0;
}
