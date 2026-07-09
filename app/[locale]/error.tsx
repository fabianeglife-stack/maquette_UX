"use client";

/** Route error boundary: brand-styled, with a retry. Copy trilingual (no dict at this level). */
export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="mx-auto flex min-h-[70svh] max-w-6xl flex-col items-start justify-center gap-6 px-6 pt-24">
      <span className="label">Fehler · Erreur · Error</span>
      <h1 className="text-4xl font-light leading-[1.12] tracking-tight text-ink md:text-5xl">
        Etwas ist schiefgelaufen.
      </h1>
      <p className="max-w-md text-base font-light leading-relaxed text-graphite">
        Bitte versuchen Sie es erneut. — Veuillez réessayer. — Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center justify-center bg-ink px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
      >
        Erneut versuchen
      </button>
    </section>
  );
}
