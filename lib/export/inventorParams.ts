/*
 * Build the parameter table that drives an Autodesk Inventor master model from a
 * configured railing. The user links this .xlsx in Inventor (Parameters → Link)
 * so the model rebuilds at the configured dimensions. Names are ASCII Inventor
 * identifiers (letters/digits/underscore); units are Inventor unit strings.
 */

import type { RailingConfig, TypeProfile } from "../engine/types";
import type { DerivedRailing } from "../engine/geometry";
import type { Cell, Sheet } from "./xlsx";

export interface InventorParam {
  name: string;
  value: number | string;
  unit: string; // "mm" | "deg" | "ul" | "" (text)
  comment: string;
}

const r0 = (n: number): number => Math.round(n);
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** The dimensional drivers of the railing as Inventor parameters. */
export function inventorParamRows(cfg: RailingConfig, derived: DerivedRailing, tp?: TypeProfile): InventorParam[] {
  const p: InventorParam[] = [];
  const seg0 = derived.segments[0];
  p.push({ name: "Hauteur", value: r0(cfg.height), unit: "mm", comment: "Hauteur du garde-corps" });
  p.push({ name: "JeuBas", value: r0(cfg.bottomGap), unit: "mm", comment: "Jeu sous la lisse basse" });
  p.push({ name: "LongueurTotale", value: r0(derived.totalLength), unit: "mm", comment: "Longueur totale (en plan)" });
  p.push({ name: "NbSegments", value: derived.segments.length, unit: "ul", comment: "Nombre de tronçons" });
  derived.segments.forEach((s, i) => {
    p.push({ name: `Longueur_${i + 1}`, value: r0(s.input.length), unit: "mm", comment: `Longueur du tronçon ${i + 1}` });
    if (Math.abs(s.slopeDeg) > 0.01) p.push({ name: `Pente_${i + 1}`, value: r1(s.slopeDeg), unit: "deg", comment: `Pente du tronçon ${i + 1}` });
  });
  p.push({ name: "NbPoteaux", value: derived.postCount, unit: "ul", comment: "Nombre de poteaux" });
  if (seg0) p.push({ name: "EntraxePoteaux", value: r0(seg0.postSpacing), unit: "mm", comment: "Entraxe des poteaux" });

  const recipe = tp?.recipe;
  if (recipe) {
    const inf = recipe.infill;
    if (inf.kind === "vertical_bars" || inf.kind === "vertical_flats") {
      p.push({ name: "NbBarreaux", value: derived.barCount, unit: "ul", comment: "Nombre de barreaux" });
      if (inf.pitch) p.push({ name: "PasBarreaux", value: r1(inf.pitch), unit: "mm", comment: "Entraxe (pas) des barreaux" });
      if (seg0) p.push({ name: "JeuBarreaux", value: r0(seg0.actualBarClear), unit: "mm", comment: "Jour libre entre barreaux" });
      if (inf.kind === "vertical_flats") {
        p.push({ name: "BarreauLarg", value: r0(inf.flatW ?? inf.memberSize), unit: "mm", comment: "Largeur du plat (barreau)" });
        p.push({ name: "BarreauEp", value: r1(inf.flatT ?? inf.memberSize), unit: "mm", comment: "Épaisseur du plat (barreau)" });
        if (inf.angleDeg) p.push({ name: "BarreauAngle", value: r0(inf.angleDeg), unit: "deg", comment: "Rotation du plat en plan" });
      } else {
        p.push({ name: "BarreauDia", value: r1(inf.memberSize), unit: "mm", comment: "Diamètre du barreau" });
      }
    } else if (inf.kind === "horizontal_rails" || inf.kind === "cables") {
      p.push({ name: "NbLisses", value: derived.railCount, unit: "ul", comment: "Nombre de lisses/câbles horizontaux" });
      p.push({ name: "LisseDia", value: r1(inf.memberSize), unit: "mm", comment: "Diamètre lisse/câble" });
    }
    const section = (prefix: string, r: { profile: string; size: number; depth?: number; wall?: number }, label: string) => {
      if (r.profile === "none") return;
      p.push({ name: `${prefix}H`, value: r0(r.size), unit: "mm", comment: `${label} — hauteur/Ø` });
      if (r.profile === "rect") p.push({ name: `${prefix}B`, value: r0(r.depth ?? r.size), unit: "mm", comment: `${label} — profondeur` });
      if (r.wall) p.push({ name: `${prefix}Ep`, value: r1(r.wall), unit: "mm", comment: `${label} — épaisseur paroi` });
    };
    section("Poteau", recipe.post, "Poteau");
    section("MainCourante", recipe.handrail, "Main courante");
    section("LisseBasse", recipe.bottomRail, "Lisse basse");
  }

  p.push({ name: "Finition", value: cfg.finish ?? "coated", unit: "", comment: "Finition de surface" });
  if (cfg.finish !== "galvanized") p.push({ name: "RAL", value: cfg.color, unit: "", comment: "Teinte RAL (thermolaquage)" });
  return p;
}

/** Assemble the workbook: an Inventor-ready parameter sheet + a human info sheet. */
export function buildInventorWorkbook(ref: string, cfg: RailingConfig, derived: DerivedRailing, tp?: TypeProfile): Sheet[] {
  const params = inventorParamRows(cfg, derived, tp);
  // "Parametres": Inventor link start cell = A1; columns Name, Value, Unit, Comment
  // (no header row, so Inventor parses every row as a parameter).
  const paramRows: Cell[][] = params.map((x) => [x.name, x.value, x.unit, x.comment]);
  const typeName = tp?.name?.de ?? tp?.id ?? cfg.typeId ?? cfg.system;
  const info: Cell[][] = [
    ["AxioForm — Paramètres pour Inventor"],
    ["Commande", ref],
    ["Type", typeName],
    ["Généré", new Date().toISOString().slice(0, 10)],
    [],
    ["Mode d'emploi (Inventor)"],
    ["1", "Inventor → Gérer → Paramètres → Lien…"],
    ["2", "Choisir ce classeur, feuille « Parametres », cellule de départ A1."],
    ["3", "Les noms doivent correspondre aux paramètres de votre modèle."],
  ];
  return [
    { name: "Parametres", rows: paramRows },
    { name: "Info", rows: info },
  ];
}
