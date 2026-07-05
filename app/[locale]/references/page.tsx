import Reveal from "@/components/Reveal";
import ReferencesGrid from "@/components/ReferencesGrid";
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
          <ReferencesGrid d={d} />
        </div>
      </section>
    </>
  );
}
