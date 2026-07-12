import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";
import { activePriceBook } from "@/lib/server/catalog";
import { defaultPriceBook, type PriceBook } from "@/lib/engine/pricing";

const isFinitePositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isValidVat = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1;

/** The published price book (defaults when none has been published). */
export async function GET() {
  return NextResponse.json({ priceBook: await activePriceBook() });
}

/** Publish a new price-book version (admin). Older versions stay for audit. */
export async function PUT(req: Request) {
  const user = await sessionUser();
  if (!hasArea(user, "pricing")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const pb = body?.priceBook as PriceBook | undefined;
  if (!pb || !isFinitePositive(pb.basePerM) || !isValidVat(pb.vatRate)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  // Reject any negative / non-finite scalar surcharge so a published book can't
  // corrupt server-authoritative totals. Nested maps (per-metre surcharges) may
  // legitimately be negative (e.g. galvanized deduction), so only top-level
  // scalars are range-checked here.
  const scalars: (keyof PriceBook)[] = [
    "glassBasePerM", "glassFreeEdgePerM", "stairPerM", "sideMountPerM",
    "publicUsagePerM", "cornerEach", "cornerEachGlass", "setupFee", "shippingFlat", "freeShippingFrom",
  ];
  for (const k of scalars) {
    const v = pb[k];
    if (v !== undefined && !isFinitePositive(v as number)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
  }
  const version = `PB-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  const next = { ...defaultPriceBook, ...pb, version };
  await db.priceBook.updateMany({ where: { active: true }, data: { active: false } });
  await db.priceBook.create({ data: { version, json: JSON.stringify(next), active: true } });
  return NextResponse.json({ priceBook: next });
}

/** Reset to the seed defaults (admin): retire all published versions. */
export async function DELETE() {
  const user = await sessionUser();
  if (!hasArea(user, "pricing")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await db.priceBook.updateMany({ where: { active: true }, data: { active: false } });
  return NextResponse.json({ priceBook: defaultPriceBook });
}
