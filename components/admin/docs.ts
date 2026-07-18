/*
 * Client-side production & logistics documents (A4, jsPDF):
 *  - Werkstattauftrag / ordre de fabrication: title sheet, parts list and
 *    the principle assembly drawing (rasterised DrawingSVG).
 *  - Kommissionierliste / liste de préparation for the warehouse.
 *  - Lieferschein / bulletin de livraison for transport.
 * All work from the order snapshot + engine output, like the invoice PDF.
 */

import { jsPDF } from "jspdf";
import type { Order } from "@/lib/store";
import { deliveryNoFor } from "@/lib/store";
import type { BomLine } from "@/lib/engine/bom";
import type { DerivedRailing } from "@/lib/engine/geometry";
import type { RailingConfig, TypeProfile } from "@/lib/engine/types";
import type { Dict } from "@/lib/i18n";
import type { BuiltDoc } from "@/lib/pdf";

type DocsDict = Dict["admin"]["docs"];
type BomDict = Dict["admin"]["bom"];

export const LEFT = 20;
export const RIGHT = 190;

export function header(doc: jsPDF, title: string, docNo: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setCharSpace(1.2);
  doc.text("AXIOFORM", LEFT, 24);
  doc.setCharSpace(0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(130);
  doc.text("AxioForm AG · Werkstrasse 12 · 6300 Zug · hello@axioform.ch", LEFT, 30);
  doc.setTextColor(0);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(title, RIGHT, 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(docNo, RIGHT, 30, { align: "right" });
  doc.setTextColor(0);
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(LEFT, 36, RIGHT, 36);
}

export function metaRow(doc: jsPDF, y: number, k: string, v: string): number {
  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text(k, LEFT, y);
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text(v, LEFT + 52, y);
  return y + 6.4;
}

export function signatureRow(doc: jsPDF, y: number, labels: string[]) {
  const w = (RIGHT - LEFT - (labels.length - 1) * 8) / labels.length;
  labels.forEach((l, i) => {
    const x = LEFT + i * (w + 8);
    doc.setDrawColor(120);
    doc.setLineWidth(0.25);
    doc.line(x, y, x + w, y);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(l, x, y + 4.5);
  });
  doc.setTextColor(0);
}

/** Parts table shared by the fabrication order and the picking list. */
function partsTable(
  doc: jsPDF,
  yStart: number,
  bom: BomLine[],
  bomDict: BomDict,
  d: DocsDict,
  withCheckbox: boolean,
): number {
  const parts: Record<string, string> = bomDict.parts;
  const rows = bom.filter((l) => l.id !== "fixings");
  const rowH = 9;
  let y = yStart;

  doc.setFontSize(8.5);
  doc.setTextColor(120);
  let x = LEFT;
  if (withCheckbox) {
    doc.text("", x, y);
    x += 10;
  }
  doc.text(d.fab.pos, x, y);
  doc.text(d.fab.qty, x + 12, y);
  doc.text(d.fab.desc, x + 34, y);
  doc.text(d.fab.dims, x + 92, y);
  if (withCheckbox) doc.text(d.pick.remark, x + 138, y);
  doc.setTextColor(0);
  y += 2.5;
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(LEFT, y, RIGHT, y);
  y += 6.5;

  rows.forEach((l, i) => {
    let cx = LEFT;
    if (withCheckbox) {
      doc.setDrawColor(60);
      doc.setLineWidth(0.3);
      doc.rect(cx, y - 3.6, 4.4, 4.4);
      cx += 10;
    }
    doc.setFontSize(9.5);
    doc.text(String(i + 1), cx, y);
    doc.text(`${l.qty.toLocaleString("de-CH")} ${bomDict.units[l.unit]}`, cx + 12, y);
    doc.text(parts[l.id] ?? l.id, cx + 34, y);
    doc.setTextColor(70);
    doc.text(l.detail || "—", cx + 92, y);
    doc.setTextColor(0);
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(LEFT, y + 3, RIGHT, y + 3);
    y += rowH;
  });
  return y;
}

/** Segment run summary for the title sheet, e.g. "S1 3000 · S2 2000 ∠+90°". */
function segmentsSummary(cfg: RailingConfig): string {
  return cfg.segments
    .map((s, i) => {
      let part = `S${i + 1} ${s.length}`;
      if (i > 0 && s.angle !== 0) part += ` ∠${s.angle > 0 ? "+" : ""}${s.angle}°`;
      if (s.stair) part += ` · ${s.slope}°`;
      return part;
    })
    .join("  ·  ");
}

/** Rasterise the principle drawing SVG onto a landscape page. Shared with the
 *  customer-facing order confirmation. */
export async function addPlanPage(doc: jsPDF, svg: SVGSVGElement, title: string) {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterisation failed"));
      img.src = url;
    });
    const scale = 2.6;
    const canvas = document.createElement("canvas");
    canvas.width = 1000 * scale;
    canvas.height = 700 * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    doc.addPage("a4", "landscape");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(title, 10, 8);
    doc.setTextColor(0);
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 8.5, 10, 280, 196);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Werkstattauftrag: title sheet + parts list + assembly drawing. */
export async function buildFabricationDoc(
  order: Order,
  cfg: RailingConfig,
  tp: TypeProfile,
  derived: DerivedRailing,
  bom: BomLine[],
  typeName: string,
  d: DocsDict,
  bomDict: BomDict,
  cfgDict: Dict["cfg"],
  svg: SVGSVGElement | null,
): Promise<BuiltDoc> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, d.fab.title, order.ref);

  // ---- Titelblatt ----
  let y = 50;
  y = metaRow(doc, y, d.fab.order, order.ref);
  y = metaRow(doc, y, d.fab.date, order.createdAt);
  y = metaRow(doc, y, d.fab.customer, `${order.customer.name} · ${order.customer.city}`);
  y = metaRow(doc, y, d.fab.type, typeName);
  y += 2;
  y = metaRow(doc, y, d.fab.length, `${(derived.totalLength / 1000).toLocaleString("de-CH")} m`);
  y = metaRow(doc, y, d.fab.height, `${cfg.height} mm`);
  y = metaRow(doc, y, d.fab.segments, segmentsSummary(cfg));
  y = metaRow(
    doc,
    y,
    d.fab.finish,
    cfg.finish === "galvanized" ? cfgDict.finishGalvanized : `${cfgDict.finishCoated} · ${cfgDict.colors[cfg.color]}`,
  );
  y = metaRow(doc, y, d.fab.substrate, cfgDict.substrates[cfg.substrate ?? "concrete_top"]);
  y += 2;
  y = metaRow(doc, y, d.fab.counts, `${derived.postCount} / ${derived.barCount} / ${derived.segments.reduce((s, x) => s + x.plates.length, 0)}`);
  y = metaRow(doc, y, d.fab.weight, `~ ${derived.weightKg} kg`);

  // production notes box
  y += 6;
  doc.setDrawColor(30);
  doc.setLineWidth(0.3);
  doc.rect(LEFT, y, RIGHT - LEFT, 42);
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(d.fab.notes, LEFT + 3, y + 5.5);
  doc.setTextColor(0);
  y += 42 + 22;

  signatureRow(doc, y, [d.fab.sigProduction, d.fab.sigQc, d.fab.sigDate]);

  // ---- Stückliste ----
  doc.addPage("a4", "portrait");
  header(doc, d.fab.partsTitle, order.ref);
  partsTable(doc, 48, bom, bomDict, d, false);

  // ---- Montageplan ----
  if (svg) await addPlanPage(doc, svg, `${d.fab.planTitle} · ${order.ref}`);

  return { doc, filename: `axioform-werkstattauftrag-${order.ref}.pdf` };
}

export async function downloadFabricationPdf(
  order: Order,
  cfg: RailingConfig,
  tp: TypeProfile,
  derived: DerivedRailing,
  bom: BomLine[],
  typeName: string,
  d: DocsDict,
  bomDict: BomDict,
  cfgDict: Dict["cfg"],
  svg: SVGSVGElement | null,
): Promise<void> {
  const { doc, filename } = await buildFabricationDoc(order, cfg, tp, derived, bom, typeName, d, bomDict, cfgDict, svg);
  doc.save(filename);
}

/** Kommissionierliste for the warehouse: checkboxes + remark column. */
export function buildPickingDoc(
  order: Order,
  derived: DerivedRailing,
  bom: BomLine[],
  d: DocsDict,
  bomDict: BomDict,
): BuiltDoc {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, d.pick.title, order.ref);

  let y = 46;
  y = metaRow(doc, y, d.fab.order, order.ref);
  y = metaRow(doc, y, d.fab.customer, order.customer.name);
  y = metaRow(doc, y, d.pick.weight, `~ ${derived.weightKg} kg`);
  y += 4;

  y = partsTable(doc, y, bom, bomDict, d, true);

  y += 16;
  signatureRow(doc, y, [d.pick.prepared, d.fab.sigDate]);
  return { doc, filename: `axioform-kommissionierung-${order.ref}.pdf` };
}

export function downloadPickingPdf(order: Order, derived: DerivedRailing, bom: BomLine[], d: DocsDict, bomDict: BomDict): void {
  const { doc, filename } = buildPickingDoc(order, derived, bom, d, bomDict);
  doc.save(filename);
}

/** Lieferschein / bulletin de livraison — works from the order snapshot alone. */
export function buildDeliveryDoc(
  order: Order,
  typeName: string,
  d: DocsDict,
  derived: DerivedRailing | null,
): BuiltDoc {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, d.del.title, deliveryNoFor(order.ref));

  // delivery address
  let y = 50;
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(d.del.deliveryAddress, LEFT, y);
  doc.setTextColor(0);
  doc.setFontSize(10.5);
  doc.text(order.customer.name, LEFT, y + 6);
  doc.text(order.customer.street, LEFT, y + 11.5);
  doc.text(order.customer.city, LEFT, y + 17);

  // meta
  const meta: [string, string][] = [
    [d.del.no, deliveryNoFor(order.ref)],
    [d.fab.order, order.ref],
    [d.fab.date, new Date().toISOString().slice(0, 10)],
  ];
  meta.forEach(([k, v], i) => {
    doc.setFontSize(9);
    doc.setTextColor(130);
    doc.text(k, RIGHT - 55, y + i * 5.5);
    doc.setTextColor(0);
    doc.text(v, RIGHT, y + i * 5.5, { align: "right" });
  });

  // positions
  y = 92;
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(d.fab.pos, LEFT, y);
  doc.text(d.fab.qty, LEFT + 12, y);
  doc.text(d.fab.desc, LEFT + 34, y);
  doc.setTextColor(0);
  y += 2.5;
  doc.setDrawColor(30);
  doc.setLineWidth(0.4);
  doc.line(LEFT, y, RIGHT, y);
  y += 7;
  const positions: [string, string][] = [
    ["1", `${typeName} · ${order.lengthM.toLocaleString("de-CH")} m`],
  ];
  if (derived) {
    positions.push(["2", `${d.del.fixings}`]);
  }
  positions.forEach(([n, txt]) => {
    doc.setFontSize(10);
    doc.text(n, LEFT, y);
    doc.text("1×", LEFT + 12, y);
    doc.text(txt, LEFT + 34, y);
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(LEFT, y + 3, RIGHT, y + 3);
    y += 9;
  });

  // colli / weight / carrier block
  y += 6;
  const infoPairs: [string, string][] = [
    [d.del.colli, derived ? String(Math.max(1, derived.segments.length + 1)) : "________"],
    [d.del.weight, derived ? `~ ${derived.weightKg} kg` : "________"],
    [d.del.carrier, "________________"],
  ];
  infoPairs.forEach(([k, v]) => {
    doc.setFontSize(9);
    doc.setTextColor(130);
    doc.text(k, LEFT, y);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(v, LEFT + 52, y);
    y += 6.4;
  });

  // note + signatures
  y += 8;
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  doc.text(d.del.note, LEFT, y, { maxWidth: RIGHT - LEFT });
  doc.setTextColor(0);
  signatureRow(doc, y + 26, [d.del.senderSig, d.del.receiverSig]);

  return { doc, filename: `axioform-lieferschein-${order.ref}.pdf` };
}

export function downloadDeliveryPdf(order: Order, typeName: string, d: DocsDict, derived: DerivedRailing | null): void {
  const { doc, filename } = buildDeliveryDoc(order, typeName, d, derived);
  doc.save(filename);
}
