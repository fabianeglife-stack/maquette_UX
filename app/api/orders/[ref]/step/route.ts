import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";
import { safeParse } from "@/lib/server/json";
import { typeById } from "@/lib/server/catalog";
import { deriveRailing } from "@/lib/engine/geometry";
import { builtinTypes, type RailingConfig, type TypeProfile } from "@/lib/engine/types";

/**
 * Per-piece STEP files for the tube laser, zipped. Each cut piece of the order
 * is the type's uploaded Inventor template (with its notches) resized to the
 * piece length. Generated on demand by the server-only OCCT kernel; persisted
 * in the order's document binder and streamed back as a download.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const user = await sessionUser();
  // The supplier deliverable belongs to purchasing (sales/production fallback).
  const allowed = (["purchasing", "orders", "production"] as const).some((a) => hasArea(user, a));
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const order = await db.order.findUnique({ where: { ref } });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!order.plansApprovedAt) return NextResponse.json({ error: "plans_approval_required" }, { status: 409 });
  const cfg = safeParse(order.configJson) as RailingConfig | null;
  if (!cfg) return NextResponse.json({ error: "no_config" }, { status: 409 });

  const tp: TypeProfile = (await typeById(cfg.typeId, cfg.system)) ?? builtinTypes[0];
  const derived = deriveRailing(cfg, tp);

  const row = await db.siteContent.findUnique({ where: { id: "steptemplates" } });
  const templates = (row ? safeParse(row.json) : null) ?? {};
  const roleTpls = (templates as Record<string, object>)[tp.id];
  if (!roleTpls || Object.keys(roleTpls).length === 0) {
    return NextResponse.json({ error: "no_templates" }, { status: 409 });
  }

  // Server-only CAD kernel — loaded lazily so it never touches the client bundle.
  const { initOC } = await import("@/lib/cad/oc");
  await initOC();
  const { buildOrderSteps } = await import("@/lib/cad/step");
  const pieces = await buildOrderSteps(ref, cfg, derived, tp, templates as Parameters<typeof buildOrderSteps>[4]);
  if (pieces.length === 0) return NextResponse.json({ error: "no_templates" }, { status: 409 });

  const entries: Record<string, Uint8Array> = {};
  for (const p of pieces) entries[p.filename] = p.bytes;
  const zip = zipSync(entries, { level: 6 });
  const filename = `axioform-${ref}-step.zip`;
  const dataB64 = Buffer.from(zip).toString("base64");

  // File it in the order's document binder (Procurement) like the other docs.
  await db.document.upsert({
    where: { orderRef_slug: { orderRef: ref, slug: "laser-step" } },
    create: { orderRef: ref, slug: "laser-step", area: "procurement", kind: "STEP laser", filename, contentType: "application/zip", data: dataB64 },
    update: { filename, contentType: "application/zip", data: dataB64, createdAt: new Date() },
  });

  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "private, no-store",
    },
  });
}
