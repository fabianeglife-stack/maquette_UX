/*
 * Tests for the Inventor Excel export: the minimal xlsx writer produces a valid,
 * re-openable package, and the parameter rows carry the design's key drivers.
 */

import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildXlsx } from "../lib/export/xlsx";
import { buildInventorWorkbook, inventorParamRows } from "../lib/export/inventorParams";
import { deriveRailing } from "../lib/engine/geometry";
import { builtinTypes, defaultConfig } from "../lib/engine/types";

const barsType = builtinTypes[0];

describe("buildXlsx", () => {
  it("emits a valid OOXML package with one worksheet per sheet", () => {
    const bytes = buildXlsx([
      { name: "A", rows: [["Nom", "Valeur"], ["Hauteur", 1100]] },
      { name: "B", rows: [["x"]] },
    ]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain("[Content_Types].xml");
    expect(Object.keys(files)).toContain("xl/workbook.xml");
    expect(Object.keys(files)).toContain("xl/worksheets/sheet1.xml");
    expect(Object.keys(files)).toContain("xl/worksheets/sheet2.xml");
    const s1 = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(s1).toContain("<v>1100</v>"); // number cell
    expect(s1).toContain("Hauteur"); // inline string cell
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="A"');
  });

  it("escapes XML and sanitises sheet names", () => {
    const bytes = buildXlsx([{ name: "a/very:long[name]that*needs-trimming-0123456789", rows: [["a & b <c>"]] }]);
    const files = unzipSync(bytes);
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain("a &amp; b &lt;c&gt;");
    const name = strFromU8(files["xl/workbook.xml"]).match(/<sheet name="([^"]*)"/)![1];
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[:\\/?*[\]]/); // Excel-forbidden chars removed
  });
});

describe("inventorParamRows", () => {
  const cfg = defaultConfig();
  const derived = deriveRailing(cfg, barsType);
  const params = inventorParamRows(cfg, derived, barsType);
  const byName = Object.fromEntries(params.map((p) => [p.name, p]));

  it("carries the height, bar count and section drivers with units", () => {
    expect(byName.Hauteur.value).toBe(Math.round(cfg.height));
    expect(byName.Hauteur.unit).toBe("mm");
    expect(byName.NbBarreaux.value).toBe(derived.barCount);
    expect(byName.NbBarreaux.unit).toBe("ul");
    expect(byName.PoteauH).toBeDefined();
    expect(byName.Finition.unit).toBe(""); // text parameter
  });

  it("uses valid Inventor identifiers (no spaces/accents)", () => {
    for (const p of params) expect(p.name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });

  it("builds a two-sheet workbook (Parametres + Info)", () => {
    const wb = buildInventorWorkbook("AX-TEST", cfg, derived, barsType);
    expect(wb.map((s) => s.name)).toEqual(["Parametres", "Info"]);
    expect(wb[0].rows.length).toBe(params.length);
    expect(wb[0].rows[0].length).toBe(4); // name, value, unit, comment
  });
});
