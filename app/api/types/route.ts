import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";
import { customTypes } from "@/lib/server/catalog";
import { builtinTypes, type TypeProfile } from "@/lib/engine/types";

/** Custom guardrail types (builtins ship in code and are not returned here). */
export async function GET() {
  return NextResponse.json({ types: await customTypes() });
}

/** Create or update a custom type (products area). */
export async function PUT(req: Request) {
  const user = await sessionUser();
  if (!hasArea(user, "products")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const tp = body?.type as TypeProfile | undefined;
  if (!tp?.id || !["bars", "glass"].includes(tp.template)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (builtinTypes.some((b) => b.id === tp.id)) {
    return NextResponse.json({ error: "builtin_readonly" }, { status: 400 });
  }
  const data = { json: JSON.stringify({ ...tp, builtin: false }), active: tp.active !== false };
  // A type profile is parameters + names; cap the row so an embedded blob
  // can't bloat the database.
  if (data.json.length > 2_000_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  await db.guardrailType.upsert({ where: { id: tp.id }, create: { id: tp.id, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
