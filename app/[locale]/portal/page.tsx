import PortalDashboard from "@/components/portal/PortalDashboard";
import Reveal from "@/components/Reveal";
import { getDict, locales } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: getDict(locale).portal.kicker };
}

export default async function Portal({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDict(locale);

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pb-12 pt-32 md:pt-40">
        <Reveal className="flex max-w-3xl flex-col gap-5">
          <span className="label">{d.portal.kicker}</span>
          <h1 className="text-3xl font-light leading-[1.12] tracking-tight text-ink md:text-4xl">{d.portal.title}</h1>
          <p className="text-base font-light leading-relaxed text-graphite">{d.portal.lead}</p>
        </Reveal>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <PortalDashboard locale={locale} t={d.portal} cfgDict={d.cfg} />
      </section>
    </>
  );
}
