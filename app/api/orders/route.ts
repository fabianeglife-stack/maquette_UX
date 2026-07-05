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

export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const orders = await db.order.findMany({
    where: user.role === "admin" ? {} : { email: user.email },
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

  const ref = "AX-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const order = await db.order.create({
    data: {
      ref,
      kind: body.kind,
      status: body.kind === "order" ? "new" : "quote_requested",
      customerName: String(body.customer.name ?? ""),
      email: String(body.customer.email ?? user?.email ?? "").toLowerCase(),
      street: String(body.customer.street ?? ""),
      city: String(body.customer.city ?? ""),
      payment: body.kind === "order" ? String(body.payment ?? "card") : null,
      system: cfg.system,
      lengthM: Math.round(derived.totalLength / 100) / 10,
      gross: price.gross,
      configJson: JSON.stringify(cfg),
      priceBookVersion: price.version,
      rulesVersion: SIA_RULES_VERSION,
      userId: user?.id ?? null,
      events: { create: { type: "created", emailTo: String(body.customer.email ?? "") } },
    },
    include: { events: true },
  });
  return NextResponse.json({ order: toClientOrder(order) }, { status: 201 });
}
