/*
 * Client-side PDF export: rasterises the shop-drawing SVG at high
 * resolution and places it on an A4 landscape sheet.
 */

import type { jsPDF as JsPdf } from "jspdf";

/** Rasterise the shop-drawing SVG onto an A4 landscape sheet (built, unsaved). */
export async function buildDrawingDoc(svg: SVGSVGElement): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");

  const xml = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterisation failed"));
      img.src = url;
    });

    const scale = 2.6; // ≈ 260 dpi on A4
    const canvas = document.createElement("canvas");
    canvas.width = 1000 * scale;
    canvas.height = 700 * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    // A4 landscape: 297 × 210 mm; drawing aspect 10:7 → 280 × 196 mm centred.
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 8.5, 7, 280, 196);
    return pdf;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadDrawingPdf(svg: SVGSVGElement, filename: string): Promise<void> {
  const pdf = await buildDrawingDoc(svg);
  pdf.save(filename);
}
