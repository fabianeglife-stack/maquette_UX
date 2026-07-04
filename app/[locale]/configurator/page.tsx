import Reveal from "@/components/Reveal";
import { BarRailingElevation, GlassRailingElevation } from "@/components/illustrations";
import { getDict, locales } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: getDict(locale).nav.configurator };
}

export default async function Configurator({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDict(locale).configurator;

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-36 md:pt-44">
        <Reveal className="flex max-w-3xl flex-col gap-6">
          <span className="label">{d.kicker}</span>
          <h1 className="text-4xl font-light leading-[1.12] tracking-tight text-ink md:text-5xl">{d.title}</h1>
          <p className="text-lg font-light leading-relaxed text-graphite">{d.lead}</p>
        </Reveal>
      </section>

      <section className="hairline-t">
        <div className="mx-auto grid max-w-6xl gap-14 px-6 py-20 md:grid-cols-[5fr_6fr] md:gap-10 md:py-28">
          {/* Steps */}
          <div className="flex flex-col">
            {d.steps.map((s, i) => (
              <Reveal key={s.t} delay={i * 100} className="flex gap-6 border-t border-hairline py-7 first:border-t-0 first:pt-0">
                <span className="pt-0.5 text-xs text-stone">0{i + 1}</span>
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg font-normal text-ink">{s.t}</h2>
                  <p className="text-sm font-light leading-relaxed text-graphite">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Static preview of the two systems */}
          <Reveal delay={150} className="flex flex-col gap-px self-start bg-hairline">
            <div className="flex flex-col gap-3 bg-mist/60 p-6">
              <span className="label">{d.preview.bars}</span>
              <BarRailingElevation />
            </div>
            <div className="flex flex-col gap-3 bg-mist/60 p-6">
              <span className="label">{d.preview.glass}</span>
              <GlassRailingElevation />
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 bg-paper px-6 py-4">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-graphite">
                <span className="h-1.5 w-1.5 rounded-full bg-steel" aria-hidden />
                {d.preview.price}
              </span>
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-graphite">
                <span className="h-1.5 w-1.5 rounded-full bg-steel" aria-hidden />
                {d.preview.sia}
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Prototype notice + quote path */}
      <section className="hairline-t">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <Reveal className="flex flex-col items-start gap-6 bg-ink p-8 md:p-14">
            <p className="max-w-2xl text-xl font-light leading-snug text-paper md:text-2xl">{d.notice}</p>
            <p className="max-w-xl text-sm font-light leading-relaxed text-paper/60">{d.noticeCta}</p>
            <a
              href="mailto:offerte@axioform.ch?subject=Offertanfrage%20Gel%C3%A4nder"
              className="inline-flex items-center justify-center bg-paper px-7 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-ink transition-colors hover:bg-mist"
            >
              {d.quoteCta}
            </a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
