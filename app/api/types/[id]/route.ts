import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";

/** Delete a custom type (products area). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!hasArea(user, "products")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await db.guardrailType.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
