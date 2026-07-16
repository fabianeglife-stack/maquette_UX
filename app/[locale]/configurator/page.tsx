import ConfiguratorApp from "@/components/configurator/ConfiguratorApp";
import Reveal from "@/components/Reveal";
import Toasts from "@/components/Toasts";
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
  const d = getDict(locale);

  return (
    <>
      <section className="mx-auto max-w-[1400px] px-6 pb-10 pt-32 md:pt-40">
        <Reveal className="flex max-w-3xl flex-col gap-5">
          <span className="label">{d.configurator.kicker}</span>
          <h1 className="text-3xl font-light leading-[1.12] tracking-tight text-ink md:text-4xl">
            {d.configurator.title}
          </h1>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 pb-24">
        <ConfiguratorApp t={d.cfg} locale={locale} quoteDict={d.portal.quote} />
      </section>
      <Toasts labels={d.common} />
    </>
  );
}
