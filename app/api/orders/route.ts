import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { toClientOrder } from "@/lib/server/serialize";
import { deriveRailing } from "@/lib/engine/geometry";
import { evaluateSia, siaSummary, SIA_RULES_VERSION } from "@/lib/engine/sia";
import { priceRailing } from "@/lib/engine/pricing";
import { activePriceBook, typeById } from "@/lib/server/catalog";
import { builtinTypes, type RailingConfig, type TypeProfile } from "@/lib/engine/types";

const TIER_DISCOUNT: Record<string, number> = { standard: 0, partner: 0.05, pro: 0.1 };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const cap = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/**
 * Minimal shape guard for a client-sent RailingConfig before it reaches the
 * geometry/pricing engines. The engines assume finite numbers and a non-empty
 * segment list; a hostile or malformed body would otherwise throw (→ 500) or
 * silently produce a bogus price.
 */
function isValidConfig(cfg: unknown): cfg is RailingConfig {
  if (!cfg || typeof cfg !== "object") return false;
  const c = cfg as Record<string, unknown>;
  if (c.system !== "bars" && c.system !== "glass") return false;
  if (!num(c.height) || !num(c.bottomGap)) return false;
  if (!Array.isArray(c.segments) || c.segments.length === 0 || c.segments.length > 50) return false;
  return c.segments.every((s) => {
    if (!s || typeof s !== "object") return false;
    const seg = s as Record<string, unknown>;
    return num(seg.length) && seg.length > 0 && num(seg.angle) && num(seg.slope);
  });
}

/** A collision-resistant order ref: AX-<8 base36 chars> from crypto randomness. */
function newRef(): string {
  const hex = crypto.randomUUID().replace(/-/g, "");
  return "AX-" + BigInt("0x" + hex).toString(36).toUpperCase().slice(0, 8);
}

export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // Tenancy keys on the immutable userId, not the (client-supplied, spoofable)
  // email — so an order carrying someone else's email can't leak into their list.
  const orders = await db.order.findMany({
    where: user.role === "admin" ? {} : { userId: user.id },
    include: { events: { orderBy: { at: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ orders: orders.map(toClientOrder) });
}

export async function POST(req: Request) {
  const user = await sessionUser();
  const body = await req.json().catch(() => null);
  if (!body?.config || !body?.customer || !["order", "quote"].includes(body.kind)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (!isValidConfig(body.config)) {
    return NextResponse.json({ error: "invalid_config" }, { status: 400 });
  }
  // Launch policy: direct orders are disabled — everything runs through a
  // reviewed quote. Set ALLOW_DIRECT_ORDERS=1 to re-enable.
  if (body.kind === "order" && process.env.ALLOW_DIRECT_ORDERS !== "1") {
    return NextResponse.json({ error: "quote_only" }, { status: 403 });
  }
  const cfg = body.config as RailingConfig;
  // Server-authoritative: the type comes from the database (builtins → stored
  // custom types → template fallback) and the price book is the published
  // version — client-sent profiles and totals are display-only, never trusted.
  const tp: TypeProfile = (await typeById(cfg.typeId, cfg.system)) ?? builtinTypes[0];
  const derived = deriveRailing(cfg, tp);
  const sia = evaluateSia(cfg, derived, tp);
  if (body.kind === "order" && siaSummary(sia) === "fail") {
    return NextResponse.json({ error: "sia_failed" }, { status: 422 });
  }
  const tier = user?.tier ?? "standard";
  const price = priceRailing(cfg, derived, await activePriceBook(), tp, TIER_DISCOUNT[tier] ?? 0);

  const email = (user?.email ?? cap(body.customer.email, 200)).toLowerCase();
  const data = {
    kind: body.kind,
    status: body.kind === "order" ? "new" : "quote_requested",
    customerName: cap(body.customer.name, 200),
    // Authenticated orders are always attributed to the session account; the
    // body email is only trusted for anonymous saves.
    email,
    street: cap(body.customer.street, 200),
    city: cap(body.customer.city, 120),
    payment: body.kind === "order" ? cap(body.payment || "card", 20) : null,
    system: cfg.system,
    lengthM: Math.round(derived.totalLength / 100) / 10,
    gross: price.gross,
    configJson: JSON.stringify(cfg),
    priceBookVersion: price.version,
    rulesVersion: SIA_RULES_VERSION,
    userId: user?.id ?? null,
    events: { create: { type: "created", emailTo: email } },
  };

  // Retry on the (astronomically unlikely) ref collision instead of 500ing.
  for (let attempt = 0; ; attempt++) {
    try {
      const order = await db.order.create({ data: { ref: newRef(), ...data }, include: { events: true } });
      return NextResponse.json({ order: toClientOrder(order) }, { status: 201 });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P2002" && attempt < 4) continue; // unique constraint on ref
      throw e;
    }
  }
}
