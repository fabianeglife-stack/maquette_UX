/*
 * Supplier purchase orders (A4, jsPDF), the documents that precede fabrication:
 *  - Materialbestellung / commande matière (BM-): steel sections nested into
 *    6 m stock bars, with the cut list annexed.
 *  - Behandlungsauftrag / commande de traitement (BT-): hot-dip galvanizing
 *    per ISO 1461, or duplex galvanizing + powder coating in the chosen RAL.
 * Same document family as docs.ts (header, meta rows, signature row).
 */

import { jsPDF } from "jspdf";
import type { Order, Suppliers, SupplierInfo } from "@/lib/store";
import { materialNoFor, treatmentNoFor } from "@/lib/store";
import { addDays } from "@/lib/engine/invoicing";
import type { MaterialOrder, TreatmentOrder } from "@/lib/engine/procurement";
import { STOCK_BAR_MM } from "@/lib/engine/procurement";
import { fmt, type Dict } from "@/lib/i18n";
import type { BuiltDoc } from "@/lib/pdf";
import { header, LEFT, metaRow, RIGHT, signatureRow } from "./docs";

type PurchaseDict = Dict["admin"]["purchase"];

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Supplier address block (mirrors the customer block on the invoice). */
function supplierBlock(doc: jsPDF, y: number, label: string, s: SupplierInfo): void {
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(label, LEFT, y);
  doc.setTextColor(0);
  doc.setFontSize(10.5);
  doc.text(s.name, LEFT, y + 6);
  doc.setFontSize(10);
  doc.text(s.street, LEFT, y + 11.5);
  doc.text(s.city, LEFT, y + 17);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(s.email, LEFT, y + 22.5);
  doc.setTextColor(0);
}

/** Group cut pieces by length → "4 × 2600 mm · 2 × 1100 mm" (longest first). */
function cutSummary(pieces: number[]): string {
  const groups = new Map<number, number>();
  pieces.forEach((p) => groups.set(p, (groups.get(p) ?? 0) + 1));
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([l, n]) => `${n} × ${l} mm`)
    .join(" · ");
}

export function buildMaterialOrderDoc(
  order: Order,
  mat: MaterialOrder,
  suppliers: Suppliers,
  t: PurchaseDict,
  bomParts: Record<string, string>,
): BuiltDoc {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const no = materialNoFor(order.ref);
  header(doc, t.materialTitle, no);

  let y = 48;
  supplierBlock(doc, y, t.supplier, suppliers.material);

  // meta block, right-aligned like the invoice
  const meta: [string, string][] = [
    [t.orderNo, no],
    [t.orderRef, order.ref],
    [t.date, todayISO()],
  ];
  if (order.deliveryDate) meta.push([t.wantedDelivery, addDays(order.deliveryDate, -14)]);
  meta.forEach(([k, v], i) => {
    doc.setFontSize(9);
    doc.setTextColor(130);
    doc.text(k, RIGHT - 55, y + i * 5.5);
    doc.setTextColor(0);
    doc.text(v, RIGHT, y + i * 5.5, { align: "right" });
  });

  // section table: article / section / pieces / stock bars / utilization / weight
  y = 84;
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(t.colArticle, LEFT, y);
  doc.text(t.colSection, LEFT + 52, y);
  doc.text(t.colPieces, LEFT + 96, y, { align: "right" });
  doc.text(fmt(t.colBars, { m: STOCK_BAR_MM / 1000 }), LEFT + 122, y, { align: "right" });
  doc.text(t.colUtil, LEFT + 146, y, { align: "right" });
  doc.text(t.colWeight, RIGHT, y, { align: "right" });
  doc.setTextColor(0);
  y += 2.5;
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(LEFT, y, RIGHT, y);
  y += 6;
  doc.setFontSize(9.5);
  mat.lines.forEach((l) => {
    doc.text(bomParts[l.id] ?? l.id, LEFT, y);
    doc.text(l.designation, LEFT + 52, y);
    doc.text(String(l.pieces.length), LEFT + 96, y, { align: "right" });
    doc.text(String(l.stockBars), LEFT + 122, y, { align: "right" });
    doc.text(`${Math.round(l.utilization * 100)} %`, LEFT + 146, y, { align: "right" });
    doc.text(`~ ${l.weightKg.toLocaleString("de-CH")} kg`, RIGHT, y, { align: "right" });
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(LEFT, y + 2.6, RIGHT, y + 2.6);
    y += 7.5;
  });
  // totals
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(LEFT, y - 1, RIGHT, y - 1);
  y += 4.5;
  doc.setFont("helvetica", "bold");
  doc.text(t.total, LEFT, y);
  doc.text(fmt(t.totalBars, { n: mat.totalBars }), LEFT + 122, y, { align: "right" });
  doc.text(`~ ${mat.totalWeightKg.toLocaleString("de-CH")} kg`, RIGHT, y, { align: "right" });
  doc.setFont("helvetica", "normal");

  // bought-in trade items (glass panels, sheet, cable)
  if (mat.trade.length > 0) {
    y += 12;
    doc.setFontSize(8.5);
    doc.setTextColor(120);
    doc.text(t.tradeTitle, LEFT, y);
    doc.setTextColor(0);
    y += 2.5;
    doc.setDrawColor(30);
    doc.line(LEFT, y, RIGHT, y);
    y += 6;
    doc.setFontSize(9.5);
    mat.trade.forEach((l) => {
      doc.text(bomParts[l.id] ?? l.id, LEFT, y);
      doc.text(l.designation, LEFT + 52, y);
      doc.text(`${l.qty.toLocaleString("de-CH")} ${l.unit === "m" ? "m" : "×"}`, RIGHT, y, { align: "right" });
      y += 6.5;
    });
  }

  signatureRow(doc, 250, [t.sigIssued, t.sigDate]);
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(t.demo, LEFT, 280);

  // ---- annex: the cut list per section ----
  doc.addPage("a4", "portrait");
  header(doc, t.cutListTitle, no);
  let cy = 50;
  doc.setFontSize(9.5);
  mat.lines.forEach((l) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${bomParts[l.id] ?? l.id} — ${l.designation}`, LEFT, cy);
    doc.setFont("helvetica", "normal");
    cy += 5.5;
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(`${t.cutPieces}: ${cutSummary(l.pieces)}`, RIGHT - LEFT) as string[];
    lines.forEach((ln) => {
      doc.text(ln, LEFT, cy);
      cy += 5;
    });
    doc.setTextColor(0);
    cy += 4;
  });

  return { doc, filename: `axioform-material-${no}.pdf` };
}

export function buildTreatmentOrderDoc(
  order: Order,
  treat: TreatmentOrder,
  suppliers: Suppliers,
  t: PurchaseDict,
  ralLabel?: string,
): BuiltDoc {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const no = treatmentNoFor(order.ref);
  header(doc, t.treatmentTitle, no);

  let y = 48;
  supplierBlock(doc, y, t.supplier, suppliers.treatment);
  const meta: [string, string][] = [
    [t.orderNo, no],
    [t.orderRef, order.ref],
    [t.date, todayISO()],
  ];
  if (order.deliveryDate) meta.push([t.wantedReturn, addDays(order.deliveryDate, -7)]);
  meta.forEach(([k, v], i) => {
    doc.setFontSize(9);
    doc.setTextColor(130);
    doc.text(k, RIGHT - 55, y + i * 5.5);
    doc.setTextColor(0);
    doc.text(v, RIGHT, y + i * 5.5, { align: "right" });
  });

  // process specification — the line the plant actually works from
  y = 84;
  y = metaRow(doc, y, t.process, treat.process === "galvanizing" ? t.processGalv : fmt(t.processDuplex, { ral: ralLabel ?? String(treat.ral ?? "") }));
  y = metaRow(doc, y, t.weightBasis, `~ ${treat.totalWeightKg.toLocaleString("de-CH")} kg`);
  y = metaRow(doc, y, t.maxPiece, `${treat.maxPieceLengthMm.toLocaleString("de-CH")} mm`);

  // elements table
  y += 6;
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(t.colElement, LEFT, y);
  doc.text(t.colQty, RIGHT, y, { align: "right" });
  doc.setTextColor(0);
  y += 2.5;
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(LEFT, y, RIGHT, y);
  y += 6;
  doc.setFontSize(9.5);
  treat.parts.forEach((p, i) => {
    doc.text(`${i + 1}`, LEFT, y);
    doc.text(fmt(t.elementDesc, { dims: p.designation }), LEFT + 12, y);
    doc.text(`${p.qty} ×`, RIGHT, y, { align: "right" });
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(LEFT, y + 2.6, RIGHT, y + 2.6);
    y += 7.5;
  });

  // handling note (hanging points, drainage) — standard galvanizing remark
  y += 6;
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  doc.text(doc.splitTextToSize(t.treatNote, RIGHT - LEFT) as string[], LEFT, y);
  doc.setTextColor(0);

  signatureRow(doc, 250, [t.sigIssued, t.sigDate]);
  doc.setTextColor(160);
  doc.setFontSize(8);
  doc.text(t.demo, LEFT, 280);

  return { doc, filename: `axioform-treatment-${no}.pdf` };
}
