import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import type { SavedConfig as DbSavedConfig } from "@prisma/client";

function toClient(s: DbSavedConfig) {
  return {
    id: s.id,
    name: s.name,
    createdAt: s.createdAt.toISOString().slice(0, 10),
    config: JSON.parse(s.configJson),
  };
}

/** The signed-in user's saved configurations. */
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const rows = await db.savedConfig.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ configs: rows.map(toClient) });
}

/** Save a configuration under the signed-in account. */
export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.config?.segments) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const row = await db.savedConfig.create({
    data: { name: String(body.name).slice(0, 120), configJson: JSON.stringify(body.config), userId: user.id },
  });
  return NextResponse.json({ config: toClient(row) }, { status: 201 });
}
