/*
 * Minimal toast bus. A module-scope emitter (not React context) so any code —
 * component handlers, hooks, non-React helpers — can report a failure without
 * prop-drilling. <Toasts/> subscribes and renders; labels are localized at the
 * mount point, so emitters only pass a kind (+ optional detail).
 */

export type ToastKind = "loadFailed" | "saveFailed";

export interface Toast {
  id: number;
  kind: ToastKind;
  detail?: string;
}

type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/** Report a failure to whichever <Toasts/> stack is mounted. */
export function notify(kind: ToastKind, detail?: string): void {
  const toast: Toast = { id: nextId++, kind, detail };
  listeners.forEach((fn) => fn(toast));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
