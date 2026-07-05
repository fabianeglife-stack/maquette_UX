/*
 * Server-side catalog: guardrail types and the published price book.
 * Single resolution path used by the catalog API routes AND the order
 * endpoint, so orders are always priced from the server's own data.
 */

import { defaultPriceBook, type PriceBook } from "@/lib/engine/pricing";
import { builtinTypes, type TypeProfile } from "@/lib/engine/types";
import { db } from "./db";

/** All custom types stored in the database (parsed TypeProfile snapshots). */
export async function customTypes(): Promise<TypeProfile[]> {
  const rows = await db.guardrailType.findMany({ orderBy: { createdAt: "asc" } });
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.json) as TypeProfile;
      } catch {
        return null;
      }
    })
    .filter((t): t is TypeProfile => t !== null);
}

/** Resolve a type id server-side: builtins → database → template fallback. */
export async function typeById(id: string | undefined, fallbackTemplate: "bars" | "glass"): Promise<TypeProfile | null> {
  const builtin = builtinTypes.find((t) => t.id === id);
  if (builtin) return builtin;
  if (id) {
    const row = await db.guardrailType.findUnique({ where: { id } });
    if (row) {
      try {
        return JSON.parse(row.json) as TypeProfile;
      } catch {
        /* corrupted row — fall through */
      }
    }
  }
  return builtinTypes.find((t) => t.id === fallbackTemplate) ?? null;
}

/** The currently published price book, or the seed defaults. */
export async function activePriceBook(): Promise<PriceBook> {
  const row = await db.priceBook.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!row) return defaultPriceBook;
  try {
    return { ...defaultPriceBook, ...(JSON.parse(row.json) as PriceBook) };
  } catch {
    return defaultPriceBook;
  }
}
