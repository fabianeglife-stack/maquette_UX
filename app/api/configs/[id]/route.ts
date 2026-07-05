import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";

/** Delete one of the signed-in user's saved configurations. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  await db.savedConfig.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
