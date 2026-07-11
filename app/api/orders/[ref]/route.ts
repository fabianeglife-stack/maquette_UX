import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { toClientOrder } from "@/lib/server/serialize";

const ORDER_STATUSES = ["new", "confirmed", "production", "shipped", "invoiced", "paid"];

export async function PATCH(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const order = await db.order.findUnique({ where: { ref } });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  // Customer action: accept a binding quote → becomes a confirmed order.
  if (body.accept === true) {
    if (order.kind !== "quote" || order.status !== "quoted") {
      return NextResponse.json({ error: "not_acceptable" }, { status: 409 });
    }
    // Ownership is the immutable userId link, not the mutable email field.
    if (user.role !== "admin" && order.userId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const updated = await db.order.update({
      where: { ref },
      data: {
        kind: "order",
        status: "confirmed",
        gross: order.quotedGross ?? order.gross,
        payment: "invoice",
        events: { create: { type: "quote_accepted", emailTo: order.email } },
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  // Admin actions: advance status or send a binding quote.
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (typeof body.quotedGross === "number" && body.quotedGross > 0) {
    const updated = await db.order.update({
      where: { ref },
      data: {
        status: "quoted",
        quotedGross: body.quotedGross,
        events: { create: { type: "quoted", emailTo: order.email } },
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  if (typeof body.status === "string" && ORDER_STATUSES.includes(body.status)) {
    const updated = await db.order.update({
      where: { ref },
      data: { status: body.status, events: { create: { type: body.status, emailTo: order.email } } },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  return NextResponse.json({ error: "invalid_input" }, { status: 400 });
}
