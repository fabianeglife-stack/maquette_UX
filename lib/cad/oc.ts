/*
 * Server-only OpenCASCADE (OCCT) initialisation for STEP generation.
 *
 * The kernel is a multi-MB WebAssembly module loaded once per process. It must
 * never reach the client bundle — import this only from a server route (a
 * dynamic import), and `replicad` / `replicad-opencascadejs` are marked as
 * server-external packages in next.config so Node loads them from node_modules
 * with real CommonJS semantics at runtime.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { setOC } from "replicad";

let ready: Promise<void> | null = null;

/** Initialise OCCT exactly once and register it with replicad. */
export function initOC(): Promise<void> {
  if (typeof window !== "undefined") throw new Error("OCCT is server-only");
  if (ready) return ready;
  ready = (async () => {
    // The emscripten glue mixes `require()` with top-level `await`, so Node's
    // ESM loader refuses it (ERR_AMBIGUOUS_MODULE_SYNTAX) — it must load through
    // CommonJS require. We grab Node's genuine require via `eval` so the bundler
    // cannot trace the binding and rewrite the dynamic require into its own
    // (empty) resolver. Loaded natively, the glue gets its own __dirname/require.
    // eslint-disable-next-line no-eval
    const nodeRequire = eval("require") as NodeRequire;
    const gluePath = nodeRequire.resolve("replicad-opencascadejs/src/replicad_single.js");
    const srcDir = dirname(gluePath);
    const g = globalThis as Record<string, unknown>;
    g.__dirname ??= srcDir;
    g.__filename ??= gluePath;
    g.require ??= nodeRequire;
    const mod = nodeRequire(gluePath);
    const factory = (mod.default ?? mod) as (
      opts: { locateFile: (p: string) => string; wasmBinary: Uint8Array },
    ) => Promise<unknown>;
    // Hand emscripten the wasm bytes directly (ESM `fs`, resolved by the bundler
    // for the builtin) so its wasm-prep path never calls its own require("fs")
    // — which, inside the server bundle, resolves to the bundler's require and
    // cannot load Node builtins.
    const wasmBinary = readFileSync(join(srcDir, "replicad_single.wasm"));
    const OC = await factory({ locateFile: (p: string) => join(srcDir, p), wasmBinary });
    setOC(OC as Parameters<typeof setOC>[0]);
  })();
  return ready;
}
