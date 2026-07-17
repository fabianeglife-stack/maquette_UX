/*
 * Client-side order-confirmation PDF. Page 1 mirrors the invoice layout
 * (summary, payment status, delivery date, delivery address); when the caller
 * provides the live principle drawing and a configuration summary, a second
 * landscape page carries them — so the customer can check every detail
 * before production starts.
 */

import { jsPDF } from "jspdf";
import { chf, defaultPriceBook, paymentPlan } from "@/lib/engine/pricing";
import { confirmationNoFor, type Order } from "@/lib/store";
import { addPlanPage } from "@/components/admin/docs";
import { fmt, type Dict } from "@/lib/i18n";
import type { BuiltDoc } from "@/lib/pdf";

// Single source of truth for the VAT rate (see the price book).
const VAT_RATE = defaultPriceBook.vatRate;

export interface ConfirmationExtras {
  /** Live principle drawing to rasterise onto a second page. */
  svg?: SVGSVGElement | null;
  /** Configuration recap rows ([label, value]) printed under the drawing title. */
  summary?: [string, string][];
}

/** Configuration recap rows for the confirmation's summary page. */
export function confirmationSummary(order: Order, cfg: Dict["cfg"], typeName: string): [string, string][] {
  const c = order.config;
  const rows: [string, string][] = [
    [cfg.drawing.typeL, `${typeName} · ${order.lengthM.toLocaleString("de-CH")} m`],
  ];
  if (!c) return rows;
  const colors = cfg.colors as Record<string, string>;
  const substrates = cfg.substrates as Record<string, string>;
  rows.push(
    [cfg.height, `${c.height} mm`],
    [cfg.substrate, c.substrate ? (substrates[c.substrate] ?? c.substrate) : "—"],
    [cfg.mounting, c.mounting === "top" ? cfg.mountingTop : cfg.mountingSide],
    [cfg.finish, c.finish === "galvanized" ? cfg.finishGalvanized : cfg.finishCoated],
    [cfg.color, colors[c.color] ?? c.color],
  );
  return rows;
}

export async function buildConfirmationDoc(
  order: Order,
  t: Dict["portal"]["confirmation"],
  payTerms: Dict["cfg"]["payTerms"],
  systemName: string,
  extras?: ConfirmationExtras,
): Promise<BuiltDoc> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = 190;
  const left = 20;

  const gross = order.quotedGross ?? order.gross;
  const net = gross / (1 + VAT_RATE);
  const vat = gross - net;
  const plan = paymentPlan(gross);

  // header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setCharSpace(1.2);
  doc.text("AXIOFORM", left, 24);
  doc.setCharSpace(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(130);
  doc.text("AxioForm AG · Werkstrasse 12 · 6300 Zug · hello@axioform.ch", left, 30);
  doc.setTextColor(0);
  doc.setFontSize(13);
  doc.text(t.title, right, 24, { align: "right" });

  // customer address (+ delivery/site address when it differs)
  doc.setFontSize(10);
  let y = 52;
  doc.text(order.customer.name, left, y);
  doc.text(order.customer.street, left, y + 5);
  doc.text(order.customer.city, left, y + 10);
  let ay = y + 15;
  if (order.customer.phone) {
    doc.setTextColor(90);
    doc.text(order.customer.phone, left, ay);
    doc.setTextColor(0);
    ay += 5;
  }
  if (order.customer.deliveryStreet || order.customer.deliveryCity) {
    doc.setFontSize(8.5);
    doc.setTextColor(130);
    doc.text(t.deliveryAddress, left, ay + 2);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(`${order.customer.deliveryStreet ?? order.customer.street}, ${order.customer.deliveryCity ?? order.customer.city}`, left, ay + 7);
  }

  // meta block
  const meta: [string, string][] = [
    [t.no, confirmationNoFor(order.ref)],
    [t.ref, order.ref],
    [t.date, order.createdAt],
  ];
  if (order.deliveryDate) meta.push([t.delivery, order.deliveryDate]);
  meta.forEach(([k, v], i) => {
    doc.setTextColor(130);
    doc.text(k, right - 45, y + i * 5);
    doc.setTextColor(0);
    doc.text(v, right, y + i * 5, { align: "right" });
  });

  // item table
  y = 92;
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(left, y, right, y);
  y += 7;
  doc.setFontSize(10);
  doc.text(`${t.item} — ${systemName}, ${order.lengthM.toLocaleString("de-CH")} m`, left, y);
  doc.text(chf(net), right, y, { align: "right" });
  y += 6;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 7;
  doc.setTextColor(90);
  doc.text(t.vat, left, y);
  doc.text(chf(vat), right, y, { align: "right" });
  doc.setTextColor(0);
  y += 7;
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(left, y, right, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(t.total, left, y);
  doc.text(chf(gross), right, y, { align: "right" });

  // payment terms
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y += 16;
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text(t.payTitle, left, y);
  doc.setFontSize(9);
  doc.setTextColor(90);
  const planLine = plan.split
    ? fmt(payTerms.split, { deposit: chf(plan.deposit), balance: chf(plan.balance) })
    : fmt(payTerms.fullUpfront, { amount: chf(plan.deposit) });
  doc.text(planLine, left, y + 6);
  doc.text(fmt(payTerms.net, { days: plan.netDays }), left, y + 11);
  // payment status: the first instalment was paid online with the order
  if (order.depositPaidAt) {
    doc.setTextColor(20, 120, 60);
    doc.text(
      fmt(plan.split ? t.depositPaid : t.fullPaid, { amount: chf(plan.deposit), date: order.depositPaidAt }),
      left,
      y + 17,
    );
    doc.setTextColor(90);
    if (plan.split) doc.text(fmt(t.balanceDue, { amount: chf(plan.balance) }), left, y + 22);
  }

  // footer
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(t.demo, left, 280);

  // page 2 — principle drawing + configuration recap, for the customer to
  // check before production starts
  if (extras?.svg) {
    await addPlanPage(doc, extras.svg, `${t.drawingTitle} — ${order.ref}`);
    if (extras.summary && extras.summary.length > 0) {
      doc.addPage("a4", "portrait");
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(t.summaryTitle, left, 24);
      doc.setFontSize(10);
      let sy = 36;
      extras.summary.forEach(([k, v]) => {
        doc.setTextColor(130);
        doc.text(k, left, sy);
        doc.setTextColor(0);
        doc.text(v, left + 70, sy);
        sy += 7;
      });
      doc.setTextColor(90);
      doc.setFontSize(9);
      doc.text(t.checkNote, left, sy + 8, { maxWidth: 170 });
    }
  }

  return { doc, filename: `axioform-confirmation-${order.ref}.pdf` };
}

export async function downloadConfirmationPdf(
  order: Order,
  t: Dict["portal"]["confirmation"],
  payTerms: Dict["cfg"]["payTerms"],
  systemName: string,
  extras?: ConfirmationExtras,
): Promise<void> {
  const { doc, filename } = await buildConfirmationDoc(order, t, payTerms, systemName, extras);
  doc.save(filename);
}
