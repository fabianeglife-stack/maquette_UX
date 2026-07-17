import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";

/**
 * Serve a stored document's bytes inline, so the browser opens (renders) the
 * PDF in a tab instead of downloading it. Gated on the Documents area — the
 * ERP binder is staff/admin territory.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await sessionUser();
  if (!hasArea(user, "documents")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const bytes = Buffer.from(doc.data, "base64");
  // Quote the filename defensively; strip anything that could break the header.
  const safeName = doc.filename.replace(/[^\w.\-]/g, "_");
  return new Response(bytes, {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
