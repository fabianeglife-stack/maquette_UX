import type { Order as DbOrder, OrderEvent as DbEvent } from "@prisma/client";
import { safeParse } from "./json";

/** Map a DB order to the shape the client UIs already consume. */
export function toClientOrder(o: DbOrder & { events?: DbEvent[] }) {
  return {
    ref: o.ref,
    kind: o.kind,
    createdAt: o.createdAt.toISOString().slice(0, 10),
    status: o.status,
    customer: {
      name: o.customerName,
      email: o.email,
      street: o.street,
      city: o.city,
      phone: o.phone ?? undefined,
      deliveryStreet: o.deliveryStreet ?? undefined,
      deliveryCity: o.deliveryCity ?? undefined,
    },
    payment: o.payment ?? undefined,
    system: o.system,
    lengthM: o.lengthM,
    gross: o.gross,
    quotedGross: o.quotedGross ?? undefined,
    validUntil: o.validUntil ?? undefined,
    deliveryDate: o.deliveryDate ?? undefined,
    plansSentAt: o.plansSentAt ?? undefined,
    plansApprovedAt: o.plansApprovedAt ?? undefined,
    materialOrderedAt: o.materialOrderedAt ?? undefined,
    treatmentOrderedAt: o.treatmentOrderedAt ?? undefined,
    materialReceivedAt: o.materialReceivedAt ?? undefined,
    treatmentSentAt: o.treatmentSentAt ?? undefined,
    treatmentReceivedAt: o.treatmentReceivedAt ?? undefined,
    palletizedAt: o.palletizedAt ?? undefined,
    depositPaidAt: o.depositPaidAt ?? undefined,
    balancePaidAt: o.balancePaidAt ?? undefined,
    reminders: safeParse(o.remindersJson) ?? undefined,
    config: safeParse(o.configJson),
    events: o.events?.map((e) => ({
      ref: e.orderRef,
      at: e.at.toISOString().slice(0, 16).replace("T", " "),
      type: e.type,
      emailTo: e.emailTo ?? undefined,
    })),
  };
}
