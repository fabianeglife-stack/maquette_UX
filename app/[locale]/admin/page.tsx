import AdminApp from "@/components/admin/AdminApp";
import Reveal from "@/components/Reveal";
import Toasts from "@/components/Toasts";
import { getDict, locales } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: getDict(locale).admin.kicker };
}

export default async function Admin({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDict(locale);

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-32 md:pt-40">
        <Reveal className="flex max-w-3xl flex-col gap-5">
          <span className="label">{d.admin.kicker}</span>
          <h1 className="text-3xl font-light leading-[1.12] tracking-tight text-ink md:text-4xl">{d.admin.title}</h1>
          <p className="text-base font-light leading-relaxed text-graphite">{d.admin.lead}</p>
        </Reveal>
      </section>
      <section className="mx-auto max-w-[1500px] px-4 pb-24 md:px-6">
        <AdminApp t={d.admin} statusLabels={d.portal.status} cfgDict={d.cfg} refsDict={d.references} aboutDict={d.about} invoiceDict={d.portal.invoice} locale={locale} />
      </section>
      <Toasts labels={d.common} />
    </>
  );
}
