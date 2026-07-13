import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";
import { toClientOrder } from "@/lib/server/serialize";
import { paymentPlan } from "@/lib/engine/pricing";

const ORDER_STATUSES = ["new", "confirmed", "production", "shipped", "invoiced", "paid"];
const ORDER_RANK = ["new", "confirmed", "production", "shipped", "invoiced", "paid"];
const todayISO = () => new Date().toISOString().slice(0, 10);

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

  // Finance action: record a payment on the deposit/full or balance invoice.
  if (body.markPaid === "deposit" || body.markPaid === "balance") {
    if (!hasArea(user, "invoices")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const field = body.markPaid === "balance" ? "balancePaidAt" : "depositPaidAt";
    const plan = paymentPlan(order.quotedGross ?? order.gross);
    const paid = {
      depositPaidAt: order.depositPaidAt,
      balancePaidAt: order.balancePaidAt,
      [field]: todayISO(),
    };
    // Fully collected once the deposit (small order) or both parts (split) are
    // paid; only then, and once delivered, does the order reach "paid".
    const allPaid = plan.split ? Boolean(paid.depositPaidAt && paid.balancePaidAt) : Boolean(paid.depositPaidAt);
    const delivered = ORDER_RANK.indexOf(order.status) >= ORDER_RANK.indexOf("shipped");
    const updated = await db.order.update({
      where: { ref },
      data: {
        [field]: todayISO(),
        ...(allPaid && delivered ? { status: "paid", events: { create: { type: "paid", emailTo: order.email } } } : {}),
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

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
    // Invoice dispatch hooks: the deposit/full invoice goes out with the order
    // confirmation, the balance invoice at delivery (shipping).
    const plan = paymentPlan(order.quotedGross ?? order.gross);
    const events: { type: string; emailTo: string }[] = [{ type: body.status, emailTo: order.email }];
    if (body.status === "confirmed") events.push({ type: plan.split ? "deposit_sent" : "invoice_sent", emailTo: order.email });
    if (body.status === "shipped" && plan.split) events.push({ type: "balance_sent", emailTo: order.email });
    const updated = await db.order.update({
      where: { ref },
      data: {
        status: body.status,
        ...(deliveryDate ? { deliveryDate } : {}),
        events: { create: events },
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
