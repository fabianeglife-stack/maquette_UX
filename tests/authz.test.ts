/* Company-portal authorization rules (pure helper, no DB). */

import { describe, expect, it } from "vitest";
import { AREAS, hasArea, isCompany, parseAccess } from "../lib/server/authz";

describe("company-portal authorization", () => {
  it("grants admins every area", () => {
    const admin = { role: "admin", access: "[]" };
    AREAS.forEach((a) => expect(hasArea(admin, a)).toBe(true));
    expect(isCompany(admin)).toBe(true);
  });

  it("grants staff exactly their listed areas", () => {
    const prod = { role: "staff", access: JSON.stringify(["production"]) };
    expect(hasArea(prod, "production")).toBe(true);
    expect(hasArea(prod, "logistics")).toBe(false);
    expect(hasArea(prod, "pricing")).toBe(false);
    expect(isCompany(prod)).toBe(true);
  });

  it("refuses customers and anonymous everywhere", () => {
    const customer = { role: "customer", access: JSON.stringify(["production"]) };
    AREAS.forEach((a) => expect(hasArea(customer, a)).toBe(false));
    expect(isCompany(customer)).toBe(false);
    expect(hasArea(null, "orders")).toBe(false);
    expect(isCompany(undefined)).toBe(false);
  });

  it("treats corrupt or unknown grants as no access", () => {
    expect(parseAccess("not json")).toEqual([]);
    expect(parseAccess(JSON.stringify({ production: true }))).toEqual([]);
    expect(parseAccess(JSON.stringify(["production", "root", 42]))).toEqual(["production"]);
    const locked = { role: "staff", access: "[]" };
    expect(isCompany(locked)).toBe(false);
    AREAS.forEach((a) => expect(hasArea(locked, a)).toBe(false));
  });
});
