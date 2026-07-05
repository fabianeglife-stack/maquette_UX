import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";

const CONTENT_ID = "references";
const EMPTY = { projects: {}, added: [] };

/** CMS overrides for the references page. */
export async function GET() {
  const row = await db.siteContent.findUnique({ where: { id: CONTENT_ID } });
  if (!row) return NextResponse.json({ content: EMPTY });
  try {
    return NextResponse.json({ content: JSON.parse(row.json) });
  } catch {
    return NextResponse.json({ content: EMPTY });
  }
}

/** Replace the CMS overrides (admin). */
export async function PUT(req: Request) {
  const user = await sessionUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const content = body?.content;
  if (!content || typeof content !== "object" || !Array.isArray(content.added)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const json = JSON.stringify({ projects: content.projects ?? {}, added: content.added });
  await db.siteContent.upsert({
    where: { id: CONTENT_ID },
    create: { id: CONTENT_ID, json },
    update: { json },
  });
  return NextResponse.json({ ok: true });
}
