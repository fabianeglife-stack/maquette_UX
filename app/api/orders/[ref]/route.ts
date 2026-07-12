import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";
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
    // Sales staff (orders area) may accept on the customer's behalf.
    if (!hasArea(user, "orders") && order.userId !== user.id) {
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

  // Company actions: advance status (any order-handling station) or send a
  // binding quote (sales/orders area).
  const canHandle = (["orders", "production", "logistics", "invoices"] as const).some((a) => hasArea(user, a));

  if (typeof body.quotedGross === "number" && body.quotedGross > 0) {
    if (!hasArea(user, "orders")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

  // Estimated delivery date, entered by staff (alone or together with a
  // status change). ISO yyyy-mm-dd, must be a real calendar date.
  let deliveryDate: string | undefined;
  if (body.deliveryDate !== undefined) {
    if (!canHandle) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const d = String(body.deliveryDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    deliveryDate = d;
  }

  if (typeof body.status === "string" && ORDER_STATUSES.includes(body.status)) {
    if (!canHandle) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    // The order confirmation always carries the estimated delivery date, so
    // confirming requires one (either already stored or set in this request).
    if (body.status === "confirmed" && !deliveryDate && !order.deliveryDate) {
      return NextResponse.json({ error: "delivery_date_required" }, { status: 409 });
    }
    const updated = await db.order.update({
      where: { ref },
      data: {
        status: body.status,
        ...(deliveryDate ? { deliveryDate } : {}),
        events: { create: { type: body.status, emailTo: order.email } },
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  if (deliveryDate) {
    const updated = await db.order.update({
      where: { ref },
      data: { deliveryDate },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  return NextResponse.json({ error: "invalid_input" }, { status: 400 });
}
