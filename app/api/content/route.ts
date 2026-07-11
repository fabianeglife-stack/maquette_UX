import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";

/** CMS content rows, one JSON blob per page (typeplans: principle PDFs per type × fixing). */
const CONTENT_IDS = ["references", "about", "home", "typeplans"] as const;
type ContentId = (typeof CONTENT_IDS)[number];

const EMPTY: Record<ContentId, unknown> = {
  references: { projects: {}, added: [] },
  about: {},
  home: {},
  typeplans: {},
};

function contentId(raw: string | null): ContentId | null {
  const id = (raw ?? "references") as ContentId;
  return CONTENT_IDS.includes(id) ? id : null;
}

/** CMS overrides for a page (default: references). */
export async function GET(req: Request) {
  const id = contentId(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "unknown_content" }, { status: 404 });
  const row = await db.siteContent.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ content: EMPTY[id] });
  try {
    return NextResponse.json({ content: JSON.parse(row.json) });
  } catch {
    return NextResponse.json({ content: EMPTY[id] });
  }
}

/** Replace a page's CMS overrides (admin). */
export async function PUT(req: Request) {
  const user = await sessionUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = contentId(typeof body?.id === "string" ? body.id : null);
  const content = body?.content;
  if (!id || !content || typeof content !== "object") {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (id === "references" && !Array.isArray(content.added)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const json = JSON.stringify(content);
  await db.siteContent.upsert({ where: { id }, create: { id, json }, update: { json } });
  return NextResponse.json({ ok: true });
}
