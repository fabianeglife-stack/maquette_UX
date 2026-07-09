import Link from "next/link";

/**
 * Brand-styled 404. not-found.tsx receives no params, so the copy is
 * kept deliberately trilingual (DE/FR/EN) on one page.
 */
export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[70svh] max-w-6xl flex-col items-start justify-center gap-6 px-6 pt-24">
      <span className="label">404</span>
      <h1 className="text-4xl font-light leading-[1.12] tracking-tight text-ink md:text-5xl">
        Seite nicht gefunden.
      </h1>
      <p className="max-w-md text-base font-light leading-relaxed text-graphite">
        Diese Seite existiert nicht (mehr). — Cette page n&apos;existe pas. — This page does not exist.
      </p>
      <Link
        href="/de/"
        className="inline-flex items-center justify-center bg-ink px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
      >
        AxioForm — Startseite
      </Link>
    </section>
  );
}
