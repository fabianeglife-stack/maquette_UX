import Link from "next/link";
import Reveal from "@/components/Reveal";
import { SectionHeader, ButtonLink } from "@/components/ui";
import { BarRailingElevation, GlassRailingElevation } from "@/components/illustrations";
import HomeHeroVisual from "@/components/HomeHeroVisual";
import HomeRefsTeaser from "@/components/HomeRefsTeaser";
import { getDict } from "@/lib/i18n";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDict(locale);

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid min-h-[60svh] md:min-h-[92svh] max-w-6xl items-center gap-10 px-6 pb-16 pt-28 md:grid-cols-[5fr_6fr] md:pt-20">
        <Reveal className="flex flex-col gap-7">
          <span className="label">{d.hero.kicker}</span>
          <h1 className="text-4xl font-light leading-[1.1] tracking-tight text-ink md:text-6xl">
            {d.hero.title}
          </h1>
          <p className="max-w-md text-lg font-light leading-relaxed text-graphite">{d.hero.lead}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <ButtonLink href={`/${locale}/configurator/`}>{d.hero.ctaPrimary}</ButtonLink>
            <ButtonLink href={`/${locale}/references/`} variant="secondary">
              {d.hero.ctaSecondary}
            </ButtonLink>
          </div>
        </Reveal>
        <Reveal delay={150}>
          <HomeHeroVisual />
        </Reveal>
      </section>

      {/* Products */}
      <section className="hairline-t">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <SectionHeader kicker={d.products.kicker} title={d.products.title} lead={d.products.lead} />
          <div className="mt-14 grid gap-px bg-hairline md:grid-cols-2">
            {(
              [
                { p: d.products.bars, Ill: BarRailingElevation },
                { p: d.products.glass, Ill: GlassRailingElevation },
              ] as const
            ).map(({ p, Ill }, i) => (
              <Reveal key={p.name} delay={i * 120} className="flex flex-col gap-6 bg-paper p-8 md:p-12">
                <div className="bg-mist/60 p-6">
                  <Ill />
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-2xl font-light tracking-tight text-ink">{p.name}</h3>
                  <span className="whitespace-nowrap text-sm text-graphite">{p.price}</span>
                </div>
                <p className="text-sm font-light leading-relaxed text-graphite">{p.desc}</p>
                <ul className="flex flex-col gap-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm font-light text-graphite">
                      <span className="h-px w-5 bg-stone" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-2">
                  <ButtonLink href={`/${locale}/configurator/`} variant="secondary">
                    {d.products.configure}
                  </ButtonLink>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="hairline-t">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <SectionHeader kicker={d.how.kicker} title={d.how.title} />
          <div className="mt-14 grid gap-10 md:grid-cols-4 md:gap-8">
            {d.how.steps.map((s, i) => (
              <Reveal key={s.t} delay={i * 100} className="flex flex-col gap-4 border-t border-ink/60 pt-5">
                <span className="text-xs text-graphite">0{i + 1}</span>
                <h3 className="text-lg font-normal text-ink">{s.t}</h3>
                <p className="text-sm font-light leading-relaxed text-graphite">{s.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SIA compliance — inverted band */}
      <section className="bg-ink">
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <SectionHeader dark kicker={d.sia.kicker} title={d.sia.title} lead={d.sia.lead} />
          <div className="mt-14 grid gap-px bg-paper/10 md:grid-cols-3">
            {d.sia.facts.map((f, i) => (
              <Reveal key={f.v} delay={i * 100} className="flex flex-col gap-3 bg-ink p-8 md:p-10">
                <span className="text-3xl font-light tracking-tight text-paper md:text-4xl">{f.v}</span>
                <p className="text-sm font-light leading-relaxed text-paper/55">{f.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* References teaser */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeader kicker={d.refsTeaser.kicker} title={d.refsTeaser.title} />
            <Reveal delay={100}>
              <Link
                href={`/${locale}/references/`}
                className="text-xs uppercase tracking-[0.16em] text-graphite underline-offset-4 hover:text-ink hover:underline"
              >
                {d.refsTeaser.linkAll} →
              </Link>
            </Reveal>
          </div>
          <HomeRefsTeaser base={d.references.projects} locale={locale} />
        </div>
      </section>

      {/* CTA band */}
      <section className="hairline-t">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-7 px-6 py-24 md:items-center md:py-32 md:text-center">
          <Reveal className="flex flex-col gap-5 md:items-center">
            <h2 className="max-w-2xl text-3xl font-light leading-tight tracking-tight text-ink md:text-[2.75rem]">
              {d.ctaBand.title}
            </h2>
            <p className="max-w-md text-base font-light leading-relaxed text-graphite">{d.ctaBand.lead}</p>
          </Reveal>
          <Reveal delay={120}>
            <ButtonLink href={`/${locale}/configurator/`}>{d.ctaBand.cta}</ButtonLink>
          </Reveal>
        </div>
      </section>
    </>
  );
}
