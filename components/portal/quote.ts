/*
 * Client-side quote/offer PDF (A4). Renders the binding price set by the
 * sales team, with its validity date — the document a customer can file or
 * forward before deciding. Mirrors the invoice layout.
 */

import { jsPDF } from "jspdf";
import { chf, defaultPriceBook } from "@/lib/engine/pricing";
import { quoteNoFor, type Order } from "@/lib/store";
import { fmt, type Dict } from "@/lib/i18n";
import type { BuiltDoc } from "@/lib/pdf";

export function buildQuoteDoc(order: Order, t: Dict["portal"]["quote"], systemName: string): BuiltDoc {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = 190;
  const left = 20;

  const amount = order.quotedGross ?? order.gross;
  const net = amount / (1 + defaultPriceBook.vatRate);
  const vat = amount - net;
  const no = quoteNoFor(order.ref);

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
    [t.no, no],
    [t.ref, order.ref],
    [t.date, order.createdAt],
  ];
  if (order.validUntil) meta.push([t.validUntil, order.validUntil]);
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
  doc.text(chf(amount), right, y, { align: "right" });

  // footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  if (order.validUntil) doc.text(fmt(t.validNote, { date: order.validUntil }), left, y + 16);
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(t.demo, left, 280);

  return { doc, filename: `axioform-quote-${no}.pdf` };
}

export function downloadQuotePdf(order: Order, t: Dict["portal"]["quote"], systemName: string): void {
  const { doc, filename } = buildQuoteDoc(order, t, systemName);
  doc.save(filename);
}
