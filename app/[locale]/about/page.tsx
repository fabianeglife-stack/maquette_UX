import Reveal from "@/components/Reveal";
import { SectionHeader } from "@/components/ui";
import { getDict, locales } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: getDict(locale).nav.about };
}

export default async function About({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDict(locale).about;

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-36 md:pt-44">
        <Reveal className="flex max-w-3xl flex-col gap-6">
          <span className="label">{d.kicker}</span>
          <h1 className="text-4xl font-light leading-[1.12] tracking-tight text-ink md:text-5xl">{d.title}</h1>
          <p className="text-lg font-light leading-relaxed text-graphite">{d.lead}</p>
        </Reveal>
      </section>

      <section className="hairline-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:py-28">
          {d.story.map((p, i) => (
            <Reveal key={i} delay={i * 120}>
              <p className="text-base font-light leading-relaxed text-graphite">{p}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="hairline-t">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="grid gap-px bg-hairline md:grid-cols-2">
            {d.values.map((v, i) => (
              <Reveal key={v.t} delay={i * 80} className="flex flex-col gap-3 bg-paper p-8 md:p-12">
                <span className="text-xs text-stone">0{i + 1}</span>
                <h2 className="text-xl font-normal tracking-tight text-ink">{v.t}</h2>
                <p className="text-sm font-light leading-relaxed text-graphite">{v.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink">
        <div className="mx-auto grid max-w-6xl gap-px bg-paper/10 px-6 py-20 md:grid-cols-4 md:py-24">
          {d.numbers.map((n, i) => (
            <Reveal key={n.d} delay={i * 80} className="flex flex-col gap-3 bg-ink p-8 md:p-10">
              <span className="text-4xl font-light tracking-tight text-paper">{n.v}</span>
              <p className="text-sm font-light leading-relaxed text-paper/55">{n.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-24 text-center md:py-32">
          <Reveal className="flex flex-col items-center gap-6">
            <p className="max-w-3xl text-2xl font-light leading-snug tracking-tight text-ink md:text-3xl">
              {d.quote}
            </p>
            <span className="label">{d.quoteAuthor}</span>
          </Reveal>
        </div>
      </section>
    </>
  );
}
