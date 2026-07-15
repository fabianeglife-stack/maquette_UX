import AdminApp from "@/components/admin/AdminApp";
import Toasts from "@/components/Toasts";
import { getDict, locales } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: getDict(locale).admin.erp.consoleStudio };
}

export default async function Studio({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDict(locale);

  return (
    <>
      {/* Standalone full-screen studio console: the fixed layer covers the site
          header (z-50) and footer, so the console owns the whole window. */}
      <div className="fixed inset-0 z-[60] bg-[#f3f4f6]">
        <AdminApp variant="studio" t={d.admin} statusLabels={d.portal.status} cfgDict={d.cfg} refsDict={d.references} aboutDict={d.about} invoiceDict={d.portal.invoice} confirmationDict={d.portal.confirmation} locale={locale} />
      </div>
      <Toasts labels={d.common} />
    </>
  );
}
