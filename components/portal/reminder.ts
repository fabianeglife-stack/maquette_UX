/*
 * Dunning letter PDF (A4): the payment reminder for an issued, unpaid
 * instalment — escalating from friendly reminder to formal notice. Mirrors
 * the invoice layout so the whole document set reads as one family.
 */

import { jsPDF } from "jspdf";
import { chf } from "@/lib/engine/pricing";
import type { Instalment } from "@/lib/engine/invoicing";
import type { Order } from "@/lib/store";
import { fmt, type Dict } from "@/lib/i18n";

export function downloadReminderPdf(
  order: Order,
  inv: Instalment,
  level: 1 | 2 | 3,
  sentAt: string,
  t: Dict["portal"]["reminder"],
): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = 190;
  const left = 20;

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
  doc.text(t.levels[level], right, 24, { align: "right" });

  // customer address
  doc.setFontSize(10);
  const y = 52;
  doc.text(order.customer.name, left, y);
  doc.text(order.customer.street, left, y + 5);
  doc.text(order.customer.city, left, y + 10);

  // meta block
  const meta: [string, string][] = [
    [t.date, sentAt],
    [t.invoiceNo, inv.no],
    [t.ref, order.ref],
    [t.dueDate, inv.dueDate ?? "—"],
  ];
  meta.forEach(([k, v], i) => {
    doc.setTextColor(130);
    doc.text(k, right - 45, y + i * 5);
    doc.setTextColor(0);
    doc.text(v, right, y + i * 5, { align: "right" });
  });

  // body
  let by = 96;
  doc.setFontSize(10);
  doc.text(fmt(t.body, { no: inv.no, due: inv.dueDate ?? "—" }), left, by, { maxWidth: 170 });
  by += 22;
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(left, by, right, by);
  by += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(t.amountDue, left, by);
  doc.text(chf(inv.amount), right, by, { align: "right" });
  by += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(fmt(level >= 3 ? t.finalNote : t.graceNote, { days: 10 }), left, by, { maxWidth: 170 });

  // footer
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(t.demo, left, 280);

  doc.save(`axioform-reminder-${inv.no}-R${level}.pdf`);
}
