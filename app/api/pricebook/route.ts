import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { activePriceBook } from "@/lib/server/catalog";
import { defaultPriceBook, type PriceBook } from "@/lib/engine/pricing";

/** The published price book (defaults when none has been published). */
export async function GET() {
  return NextResponse.json({ priceBook: await activePriceBook() });
}

/** Publish a new price-book version (admin). Older versions stay for audit. */
export async function PUT(req: Request) {
  const user = await sessionUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const pb = body?.priceBook as PriceBook | undefined;
  if (!pb || typeof pb.basePerM !== "number" || typeof pb.vatRate !== "number") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
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
  if (user?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await db.priceBook.updateMany({ where: { active: true }, data: { active: false } });
  return NextResponse.json({ priceBook: defaultPriceBook });
}
