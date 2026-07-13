import AdminApp from "@/components/admin/AdminApp";
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
      {/* Standalone full-screen back-office: the fixed layer covers the site
          header (z-50) and footer, so the ERP owns the whole window. */}
      <div className="fixed inset-0 z-[60] bg-[#f3f4f6]">
        <AdminApp t={d.admin} statusLabels={d.portal.status} cfgDict={d.cfg} refsDict={d.references} aboutDict={d.about} invoiceDict={d.portal.invoice} locale={locale} />
      </div>
      <Toasts labels={d.common} />
    </>
  );
}
