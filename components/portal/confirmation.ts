/*
 * Client-side order-confirmation PDF (A4). Mirrors the invoice layout and
 * works from the order snapshot alone; carries the payment terms and the
 * staff-entered estimated delivery date.
 */

import { jsPDF } from "jspdf";
import { chf, paymentPlan } from "@/lib/engine/pricing";
import { confirmationNoFor, type Order } from "@/lib/store";
import { fmt, type Dict } from "@/lib/i18n";

const VAT_RATE = 0.081;

export function downloadConfirmationPdf(
  order: Order,
  t: Dict["portal"]["confirmation"],
  payTerms: Dict["cfg"]["payTerms"],
  systemName: string,
): void {
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

  // customer address
  doc.setFontSize(10);
  let y = 52;
  doc.text(order.customer.name, left, y);
  doc.text(order.customer.street, left, y + 5);
  doc.text(order.customer.city, left, y + 10);

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

  // footer
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(t.demo, left, 280);

  doc.save(`axioform-confirmation-${order.ref}.pdf`);
}
