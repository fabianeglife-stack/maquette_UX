import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";

/** Departments a stored document can belong to (mirrors the binder columns). */
const AREAS = ["sale", "finance", "procurement", "production", "logistics", "technical"];
/** Cap the stored base64 payload so a runaway generation can't bloat the DB. */
const MAX_BASE64 = 15_000_000;

type DocRow = {
  id: string;
  slug: string;
  area: string;
  kind: string;
  no: string | null;
  filename: string;
  createdAt: Date;
};

const toMeta = (d: DocRow) => ({
  id: d.id,
  slug: d.slug,
  area: d.area,
  kind: d.kind,
  no: d.no,
  filename: d.filename,
  createdAt: d.createdAt.toISOString(),
});

/** List the documents already persisted against an order (metadata only). */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const user = await sessionUser();
  if (!hasArea(user, "documents")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const documents = await db.document.findMany({
    where: { orderRef: ref },
    select: { id: true, slug: true, area: true, kind: true, no: true, filename: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ documents: documents.map(toMeta) });
}

/** Persist a freshly generated PDF against an order (upsert by slug). */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const user = await sessionUser();
  if (!hasArea(user, "documents")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const order = await db.order.findUnique({ where: { ref } });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const area = typeof body.area === "string" ? body.area : "";
  const kind = typeof body.kind === "string" ? body.kind : "";
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const no = typeof body.no === "string" && body.no ? body.no : null;
  const dataUri = typeof body.dataUri === "string" ? body.dataUri : "";

  if (!slug || !/^[a-z0-9-]+$/.test(slug) || !AREAS.includes(area) || !kind || !filename) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  // Accept only a base64 PDF data URI; store the base64 payload alone.
  const comma = dataUri.indexOf("base64,");
  if (!dataUri.startsWith("data:application/pdf") || comma === -1) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const data = dataUri.slice(comma + "base64,".length);
  if (!data) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (data.length > MAX_BASE64) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  const saved = await db.document.upsert({
    where: { orderRef_slug: { orderRef: ref, slug } },
    create: { orderRef: ref, slug, area, kind, no, filename, data },
    update: { area, kind, no, filename, data, createdAt: new Date() },
  });
  return NextResponse.json({ document: toMeta(saved) });
}
