/*
 * Client-side invoice PDF (A4) for portal orders. Works from the order
 * snapshot alone (gross incl. VAT), so seeded fixtures get invoices too.
 */

import { jsPDF } from "jspdf";
import { chf, defaultPriceBook } from "@/lib/engine/pricing";
import { invoiceNoFor, type Order } from "@/lib/store";
import type { Instalment } from "@/lib/engine/invoicing";
import { fmt, type Dict } from "@/lib/i18n";

// Single source of truth for the VAT rate (see the price book).
const VAT_RATE = defaultPriceBook.vatRate;

/**
 * Invoice PDF (A4). Without an `instalment` it bills the full order; with one
 * it bills that part (deposit / balance / full) — its own number, amount, due
 * date and a note pointing back at the order total.
 */
export function downloadInvoicePdf(order: Order, t: Dict["portal"]["invoice"], systemName: string, instalment?: Instalment): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = 190;
  const left = 20;

  const amount = instalment ? instalment.amount : order.gross;
  const net = amount / (1 + VAT_RATE);
  const vat = amount - net;
  const no = instalment ? instalment.no : invoiceNoFor(order.ref);
  const title = instalment?.kind === "deposit" ? t.deposit : instalment?.kind === "balance" ? t.balance : t.title;

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
  doc.text(title, right, 24, { align: "right" });

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
    [t.date, instalment?.issuedAt ?? order.createdAt],
  ];
  if (instalment?.dueDate) meta.push([t.due, instalment.dueDate]);
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
  const itemLabel = instalment && instalment.kind !== "full" ? `${title} — ${systemName}, ${order.lengthM.toLocaleString("de-CH")} m` : `${t.item} — ${systemName}, ${order.lengthM.toLocaleString("de-CH")} m`;
  doc.text(itemLabel, left, y);
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
  // For a split instalment, point back at the full order total.
  if (instalment && instalment.kind !== "full") {
    doc.text(fmt(t.partOf, { total: chf(order.gross) }), left, y + 9);
    doc.text(t.payable, left, y + 16);
  } else {
    doc.text(t.payable, left, y + 16);
  }
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(t.demo, left, 280);

  doc.save(`axioform-invoice-${no}.pdf`);
}
