import Reveal from "@/components/Reveal";
import type { Dict } from "@/lib/i18n";

export default function LegalPage({ doc }: { doc: Dict["legalPages"]["imprint"] }) {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-24 pt-36 md:pt-44">
      <Reveal className="flex flex-col gap-6">
        <h1 className="text-4xl font-light leading-[1.12] tracking-tight text-ink md:text-5xl">{doc.title}</h1>
        <p className="text-lg font-light leading-relaxed text-graphite">{doc.intro}</p>
      </Reveal>
      <div className="mt-12 flex flex-col gap-8">
        {doc.blocks.map((b) => (
          <Reveal key={b.h} className="flex flex-col gap-2 border-t border-hairline pt-6">
            <h2 className="text-base font-normal text-ink">{b.h}</h2>
            <p className="text-sm font-light leading-relaxed text-graphite">{b.p}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
