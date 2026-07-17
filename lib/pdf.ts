/*
 * Shared PDF delivery helpers. The generators build a jsPDF document; how it
 * reaches the user differs by context: the static prototype downloads it
 * (`doc.save`), while the backend Documents station persists it and serves it
 * inline. `docToDataUri` yields the base64 data URI to persist.
 */

import type { jsPDF } from "jspdf";

/** A built document plus the filename it should carry when saved/stored. */
export interface BuiltDoc {
  doc: jsPDF;
  filename: string;
}

/** Base64 `data:application/pdf;…;base64,…` URI for persistence/upload. */
export function docToDataUri(doc: jsPDF): string {
  return doc.output("datauristring");
}
