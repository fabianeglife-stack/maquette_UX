/*
 * Client-side invoice PDF (A4) for portal orders. Works from the order
 * snapshot alone (gross incl. VAT), so seeded fixtures get invoices too.
 */

import { jsPDF } from "jspdf";
import { chf } from "@/lib/engine/pricing";
import type { Order } from "@/lib/store";
import type { Dict } from "@/lib/i18n";

const VAT_RATE = 0.081;

export function downloadInvoicePdf(order: Order, t: Dict["portal"]["invoice"], systemName: string): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = 190;
  const left = 20;

  const net = order.gross / (1 + VAT_RATE);
  const vat = order.gross - net;

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
    [t.ref, order.ref],
    [t.date, order.createdAt],
  ];
  if (order.payment) meta.push([t.payment, order.payment.toUpperCase()]);
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
  doc.text(chf(order.gross), right, y, { align: "right" });

  // footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(t.payable, left, y + 16);
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(t.demo, left, 280);

  doc.save(`axioform-invoice-${order.ref}.pdf`);
}
