/*
 * Data access dispatch: one call surface for the UIs, backed by the server
 * API when NEXT_PUBLIC_BACKEND=1 and by localStorage in the static prototype.
 * Server errors degrade to the local/default values so the UI never blocks.
 */

import { api, hasBackend } from "./api";
import { builtinTypes, type RailingConfig, type TypeProfile } from "./engine/types";
import { defaultPriceBook, type PriceBook } from "./engine/pricing";
import {
  deleteCustomType,
  deleteSavedConfig,
  loadAllTypes,
  loadContent,
  loadPriceBook,
  loadSavedConfigs,
  mergedProjects,
  resetPriceBook,
  saveContent,
  saveCustomType,
  savePriceBook,
  saveSavedConfig,
  type ContentState,
  type RefProject,
  type SavedConfig,
} from "./store";

/* ---------- guardrail types ---------- */

// One request per page load; admin mutations invalidate it.
let typesPromise: Promise<TypeProfile[]> | null = null;

export function fetchAllTypes(): Promise<TypeProfile[]> {
  if (!hasBackend) return Promise.resolve(loadAllTypes());
  if (!typesPromise) {
    typesPromise = api
      .listTypes()
      .then((custom) => [...builtinTypes, ...custom])
      .catch(() => [...builtinTypes]);
  }
  return typesPromise;
}

/** Pure lookup against an already-fetched list (render-time type resolution). */
export function resolveType(types: TypeProfile[], id: string | undefined, fallbackTemplate: "bars" | "glass"): TypeProfile {
  return types.find((t) => t.id === id) ?? types.find((t) => t.id === fallbackTemplate) ?? builtinTypes[0];
}

export async function saveType(tp: TypeProfile): Promise<void> {
  if (hasBackend) {
    await api.putType(tp);
    typesPromise = null;
  } else {
    saveCustomType(tp);
  }
}

export async function removeType(id: string): Promise<void> {
  if (hasBackend) {
    await api.deleteType(id);
    typesPromise = null;
  } else {
    deleteCustomType(id);
  }
}

/* ---------- price book ---------- */

export function fetchPriceBook(): Promise<PriceBook> {
  if (!hasBackend) return Promise.resolve(loadPriceBook());
  return api.getPriceBook().catch(() => defaultPriceBook);
}

export async function publishPriceBook(pb: PriceBook): Promise<PriceBook> {
  if (hasBackend) return api.putPriceBook(pb);
  savePriceBook(pb);
  return loadPriceBook();
}

export async function resetPriceBookAll(): Promise<PriceBook> {
  if (hasBackend) return api.resetPriceBook();
  resetPriceBook();
  return loadPriceBook();
}

/* ---------- references CMS ---------- */

export function fetchContent(): Promise<ContentState> {
  if (!hasBackend) return Promise.resolve(loadContent());
  return api.getContent().catch(() => ({ projects: {}, added: [] }));
}

export async function putContent(c: ContentState): Promise<void> {
  if (hasBackend) {
    await api.putContent(c);
  } else {
    saveContent(c);
  }
}

export function fetchMergedProjects(base: RefProject[]): Promise<RefProject[]> {
  if (!hasBackend) return Promise.resolve(mergedProjects(base));
  return fetchContent().then((c) => [...base.map((p, i) => ({ ...p, ...(c.projects[i] ?? {}) })), ...c.added]);
}

/* ---------- saved configurations ---------- */

export function fetchSavedConfigs(): Promise<SavedConfig[]> {
  if (!hasBackend) return Promise.resolve(loadSavedConfigs());
  // 401 (not signed in) degrades to the local list so nothing disappears.
  return api.listConfigs().catch(() => loadSavedConfigs());
}

export async function addSavedConfig(name: string, config: RailingConfig): Promise<SavedConfig> {
  if (hasBackend) {
    try {
      return await api.createConfig(name, config);
    } catch {
      // Not signed in — keep the save locally rather than losing it.
      return saveSavedConfig(name, config);
    }
  }
  return saveSavedConfig(name, config);
}

export async function removeSavedConfig(id: string): Promise<void> {
  if (hasBackend) {
    await api.deleteConfig(id).catch(() => {});
  }
  deleteSavedConfig(id);
}
