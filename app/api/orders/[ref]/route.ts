import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { sessionUser } from "@/lib/server/auth";
import { hasArea } from "@/lib/server/authz";
import { toClientOrder } from "@/lib/server/serialize";
import { safeParse } from "@/lib/server/json";
import { paymentPlan } from "@/lib/engine/pricing";
import { MILESTONE_FIELD, milestoneReady, QUOTE_VALID_DAYS, type Milestone } from "@/lib/store";

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
    // A binding quote is only acceptable within its validity window.
    if (order.validUntil && todayISO() > order.validUntil) {
      return NextResponse.json({ error: "quote_expired" }, { status: 409 });
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

  // Plan approval — the sign-off stage between checkout and confirmation.
  // Staff sends the detail plans; the customer approves them (or requests a
  // change) in the portal; only an approved order can be confirmed.

  // Staff action: send the detail plans to the customer for sign-off. A
  // re-send after a change request refreshes the date and clears the state.
  if (body.sendPlans === true) {
    if (!hasArea(user, "orders")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (order.kind !== "order" || order.status !== "new") {
      return NextResponse.json({ error: "not_plannable" }, { status: 409 });
    }
    // The plan package is generated from the configuration snapshot.
    if (!order.configJson) return NextResponse.json({ error: "no_config" }, { status: 409 });
    const updated = await db.order.update({
      where: { ref },
      data: {
        plansSentAt: todayISO(),
        plansApprovedAt: null,
        events: { create: { type: "plans_sent", emailTo: order.email } },
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  // Customer action: approve the plans (or request a change, which sends the
  // order back to plan revision). Staff may record either on their behalf.
  if (body.approvePlans === true || body.requestPlanChanges === true) {
    if (!hasArea(user, "orders") && order.userId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (order.kind !== "order" || order.status !== "new" || !order.plansSentAt || order.plansApprovedAt) {
      return NextResponse.json({ error: "not_approvable" }, { status: 409 });
    }
    const approve = body.approvePlans === true;
    const updated = await db.order.update({
      where: { ref },
      data: approve
        ? { plansApprovedAt: todayISO(), events: { create: { type: "plans_approved", emailTo: order.email } } }
        : { plansSentAt: null, events: { create: { type: "plans_change_requested", emailTo: order.email } } },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  // Procurement & logistics milestones — the physical chain between plan
  // approval and shipment: supplier POs (material BM-, treatment BT-), goods
  // receipt of the material, shipment to / return from the treatment plant,
  // and palletizing. Chain rules live in milestoneReady (lib/store.ts).
  if (typeof body.milestone === "string" && body.milestone in MILESTONE_FIELD) {
    const m = body.milestone as Milestone;
    const isPo = m === "material_ordered" || m === "treatment_ordered";
    // POs belong to the purchasing station (sales as fallback); the final
    // inspection to the shop floor (production); the physical movements —
    // goods receipt, treatment round-trip, palletizing, delivery — to logistics.
    const allowed = isPo
      ? hasArea(user, "purchasing") || hasArea(user, "orders")
      : m === "qc_passed"
        ? hasArea(user, "production")
        : hasArea(user, "logistics");
    if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!milestoneReady(order, m)) return NextResponse.json({ error: "milestone_order" }, { status: 409 });
    // A PO event carries the supplier's email; the delivery event notifies the
    // customer; the other movements are internal and email nobody.
    let emailTo: string | undefined;
    if (isPo) {
      const row = await db.siteContent.findUnique({ where: { id: "suppliers" } });
      const sup = (row ? safeParse(row.json) : null) as { material?: { email?: string }; treatment?: { email?: string } } | null;
      emailTo = (m === "material_ordered" ? sup?.material?.email : sup?.treatment?.email) || undefined;
    } else if (m === "delivered") {
      emailTo = order.email;
    }
    const updated = await db.order.update({
      where: { ref },
      data: {
        [MILESTONE_FIELD[m]]: todayISO(),
        // Proof of delivery: the recipient's name at handover.
        ...(m === "delivered" && typeof body.deliveredTo === "string" && body.deliveredTo.trim()
          ? { deliveredTo: body.deliveredTo.trim().slice(0, 120) }
          : {}),
        events: { create: { type: m, emailTo } },
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  // Shipment details (carrier + tracking number), editable by any handling
  // station from packing onwards; shown to the customer in the portal.
  if (typeof body.carrier === "string" || typeof body.trackingNo === "string") {
    const canShip = (["orders", "logistics"] as const).some((a) => hasArea(user, a));
    if (!canShip) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const updated = await db.order.update({
      where: { ref },
      data: {
        ...(typeof body.carrier === "string" ? { carrier: body.carrier.trim().slice(0, 60) || null } : {}),
        ...(typeof body.trackingNo === "string" ? { trackingNo: body.trackingNo.trim().slice(0, 60) || null } : {}),
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  // Dunning: send a payment reminder for an issued, unpaid instalment
  // (finance area). Reminder dates accumulate in the order's JSON trail.
  if (body.remind === "deposit" || body.remind === "balance") {
    if (!hasArea(user, "invoices")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const isBalance = body.remind === "balance";
    const issued = isBalance ? ORDER_RANK.indexOf(order.status) >= ORDER_RANK.indexOf("shipped") : true;
    const paid = isBalance ? order.balancePaidAt : order.depositPaidAt;
    if (!issued || paid) return NextResponse.json({ error: "not_remindable" }, { status: 409 });
    const reminders = (safeParse(order.remindersJson) ?? {}) as { deposit?: string[]; balance?: string[] };
    const list = [...(reminders[body.remind as "deposit" | "balance"] ?? []), todayISO()];
    const updated = await db.order.update({
      where: { ref },
      data: {
        remindersJson: JSON.stringify({ ...reminders, [body.remind]: list }),
        events: { create: { type: "reminder_sent", emailTo: order.email } },
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  // Cancel: a customer may withdraw their own order while it is still in
  // review, or decline their quote; sales staff may additionally cancel a
  // confirmed order. Later stages are committed to production.
  if (body.cancel === true) {
    const isStaff = hasArea(user, "orders");
    if (!isStaff && order.userId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const cancellable =
      order.kind === "quote"
        ? order.status === "quote_requested" || order.status === "quoted"
        : order.status === "new" || (isStaff && order.status === "confirmed");
    if (!cancellable) return NextResponse.json({ error: "not_cancellable" }, { status: 409 });
    const updated = await db.order.update({
      where: { ref },
      data: { status: "cancelled", events: { create: { type: "cancelled", emailTo: order.email } } },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  // Company actions: advance status (any order-handling station) or send a
  // binding quote (sales/orders area).
  const canHandle = (["orders", "production", "logistics", "invoices"] as const).some((a) => hasArea(user, a));

  // Finance action: record a payment on the deposit/full or balance invoice.
  // An optional paidAt (yyyy-mm-dd, not in the future) backdates the receipt
  // to the actual bank value date.
  if (body.markPaid === "deposit" || body.markPaid === "balance") {
    if (!hasArea(user, "invoices")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    let paidAt = todayISO();
    if (body.paidAt !== undefined) {
      const d = String(body.paidAt);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || d > todayISO()) {
        return NextResponse.json({ error: "invalid_input" }, { status: 400 });
      }
      paidAt = d;
    }
    const field = body.markPaid === "balance" ? "balancePaidAt" : "depositPaidAt";
    const plan = paymentPlan(order.quotedGross ?? order.gross);
    const paid = {
      depositPaidAt: order.depositPaidAt,
      balancePaidAt: order.balancePaidAt,
      [field]: paidAt,
    };
    // Fully collected once the deposit (small order) or both parts (split) are
    // paid; only then, and once delivered, does the order reach "paid".
    const allPaid = plan.split ? Boolean(paid.depositPaidAt && paid.balancePaidAt) : Boolean(paid.depositPaidAt);
    const delivered = ORDER_RANK.indexOf(order.status) >= ORDER_RANK.indexOf("shipped");
    const updated = await db.order.update({
      where: { ref },
      data: {
        [field]: paidAt,
        ...(allPaid && delivered ? { status: "paid", events: { create: { type: "paid", emailTo: order.email } } } : {}),
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  if (typeof body.quotedGross === "number" && body.quotedGross > 0) {
    if (!hasArea(user, "orders")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    // The binding quote carries a validity window from the day it is sent.
    const validUntil = new Date(Date.now() + QUOTE_VALID_DAYS * 86400000).toISOString().slice(0, 10);
    const updated = await db.order.update({
      where: { ref },
      data: {
        status: "quoted",
        quotedGross: body.quotedGross,
        validUntil,
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
    // An order fresh from checkout can only be confirmed once the customer
    // has signed off the detail plans in the portal.
    if (body.status === "confirmed" && order.status === "new" && !order.plansApprovedAt) {
      return NextResponse.json({ error: "plans_approval_required" }, { status: 409 });
    }
    // Fabrication only starts once both supplier POs are out and the material
    // has been received by logistics; shipment to the customer only after the
    // parts are back from treatment and palletized. (Configured orders only —
    // seeded fixtures without a configuration keep the simple flow.)
    if (order.configJson) {
      if (
        body.status === "production" &&
        !(order.materialOrderedAt && order.treatmentOrderedAt && order.materialReceivedAt)
      ) {
        return NextResponse.json({ error: "procurement_required" }, { status: 409 });
      }
      if (body.status === "shipped" && !(order.treatmentReceivedAt && order.palletizedAt)) {
        return NextResponse.json({ error: "logistics_required" }, { status: 409 });
      }
    }
    // Invoice dispatch hooks: the deposit/full amount is paid online with the
    // order itself; only the balance invoice goes out at delivery (shipping).
    const plan = paymentPlan(order.quotedGross ?? order.gross);
    const events: { type: string; emailTo: string }[] = [{ type: body.status, emailTo: order.email }];
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
    // Entering the estimated delivery date on a plan-approved order in review
    // IS the confirmation: the order moves to "confirmed" and the confirmation
    // (summary + principle drawing) goes out to the customer immediately.
    // Before the customer has signed off the plans, the date is only stored.
    const confirmNow = order.kind === "order" && order.status === "new" && Boolean(order.plansApprovedAt);
    const updated = await db.order.update({
      where: { ref },
      data: {
        deliveryDate,
        ...(confirmNow ? { status: "confirmed", events: { create: { type: "confirmed", emailTo: order.email } } } : {}),
      },
      include: { events: { orderBy: { at: "asc" } } },
    });
    return NextResponse.json({ order: toClientOrder(updated) });
  }

  return NextResponse.json({ error: "invalid_input" }, { status: 400 });
}
