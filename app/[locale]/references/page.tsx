import Reveal from "@/components/Reveal";
import { ReferenceScene } from "@/components/illustrations";
import { getDict, locales } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: getDict(locale).nav.references };
}

export default async function References({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDict(locale).references;

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
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <div className="grid gap-14 md:grid-cols-2 md:gap-x-10 md:gap-y-20">
            {d.projects.map((p, i) => (
              <Reveal key={p.name} delay={(i % 2) * 120} className="flex flex-col gap-5">
                <div className="bg-mist/60 p-5">
                  <ReferenceScene index={i} />
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-normal tracking-tight text-ink">{p.name}</h2>
                  <span className="text-sm font-light text-stone">{p.place}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-hairline pt-4">
                  <dt className="text-xs uppercase tracking-[0.14em] text-stone">{d.labels.system}</dt>
                  <dd className="text-sm font-light text-graphite">{p.system}</dd>
                  <dt className="text-xs uppercase tracking-[0.14em] text-stone">{d.labels.length}</dt>
                  <dd className="text-sm font-light text-graphite">{p.length}</dd>
                  <dt className="text-xs uppercase tracking-[0.14em] text-stone">{d.labels.mounting}</dt>
                  <dd className="text-sm font-light text-graphite">{p.mounting}</dd>
                </dl>
                <p className="text-sm font-light leading-relaxed text-graphite">{p.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
