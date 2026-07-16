/*
 * Unit tests for the quote-validity helper and the login rate limiter.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { isQuoteExpired, planFor, type TypePlans } from "../lib/store";
import { isBlocked, recordFailure, recordSuccess, resetAll } from "../lib/server/ratelimit";

describe("isQuoteExpired", () => {
  it("is valid on the validity date itself and before", () => {
    expect(isQuoteExpired({ validUntil: "2026-08-12" }, "2026-08-12")).toBe(false);
    expect(isQuoteExpired({ validUntil: "2026-08-12" }, "2026-07-15")).toBe(false);
  });
  it("expires the day after the validity date", () => {
    expect(isQuoteExpired({ validUntil: "2026-08-12" }, "2026-08-13")).toBe(true);
  });
  it("never expires without a validity date (legacy quotes)", () => {
    expect(isQuoteExpired({}, "2099-01-01")).toBe(false);
  });
});

describe("planFor (type × substrate × mounting resolution)", () => {
  const plans: TypePlans = {
    bars: {
      "concrete_side|top": "combo.pdf",
      concrete_side: "substrate-legacy.pdf",
      side: "mounting-legacy.pdf",
    },
  };

  it("prefers the exact substrate|mounting combination", () => {
    expect(planFor(plans, "bars", "concrete_side", "top", "builtin.pdf")).toBe("combo.pdf");
  });
  it("falls back to the bare-substrate legacy upload", () => {
    expect(planFor(plans, "bars", "concrete_side", "side", "builtin.pdf")).toBe("substrate-legacy.pdf");
  });
  it("then to the bare-mounting legacy upload", () => {
    expect(planFor(plans, "bars", "wood_side", "side", "builtin.pdf")).toBe("mounting-legacy.pdf");
  });
  it("and finally to the type's built-in plan", () => {
    expect(planFor(plans, "bars", "stone_top", "top", "builtin.pdf")).toBe("builtin.pdf");
    expect(planFor(plans, "glass", "concrete_side", "top", undefined)).toBeUndefined();
  });
  it("derives the mounting from the substrate when omitted", () => {
    // concrete_side implies "side" → bare-substrate legacy, not the top combo
    expect(planFor(plans, "bars", "concrete_side", undefined, "builtin.pdf")).toBe("substrate-legacy.pdf");
  });
});

describe("login rate limiter", () => {
  beforeEach(resetAll);
  const T0 = 1_000_000_000_000;

  it("blocks after five failures within the window", () => {
    for (let i = 0; i < 4; i++) expect(recordFailure("ip|a@b.ch", T0 + i)).toBe(false);
    expect(isBlocked("ip|a@b.ch", T0 + 4)).toBe(false);
    expect(recordFailure("ip|a@b.ch", T0 + 5)).toBe(true);
    expect(isBlocked("ip|a@b.ch", T0 + 6)).toBe(true);
  });

  it("keys are independent", () => {
    for (let i = 0; i < 5; i++) recordFailure("ip|a@b.ch", T0 + i);
    expect(isBlocked("ip|a@b.ch", T0 + 9)).toBe(true);
    expect(isBlocked("ip|other@b.ch", T0 + 9)).toBe(false);
  });

  it("a successful login clears the counter", () => {
    for (let i = 0; i < 5; i++) recordFailure("ip|a@b.ch", T0 + i);
    recordSuccess("ip|a@b.ch");
    expect(isBlocked("ip|a@b.ch", T0 + 9)).toBe(false);
  });

  it("the window rolls over after 15 minutes", () => {
    for (let i = 0; i < 5; i++) recordFailure("ip|a@b.ch", T0 + i);
    expect(isBlocked("ip|a@b.ch", T0 + 10)).toBe(true);
    expect(isBlocked("ip|a@b.ch", T0 + 15 * 60 * 1000)).toBe(false);
    // and a fresh failure starts a new window rather than re-blocking
    expect(recordFailure("ip|a@b.ch", T0 + 15 * 60 * 1000 + 1)).toBe(false);
  });
});
