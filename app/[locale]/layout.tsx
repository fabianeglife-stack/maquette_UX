import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getDict, locales } from "@/lib/i18n";
import "../globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return {
    title: {
      default: "AxioForm — " + dict.hero.title,
      template: "%s — AxioForm",
    },
    description: dict.hero.lead,
    icons: { icon: `${basePath}/favicon.svg` },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = getDict(locale);

  return (
    <html lang={locale} className={GeistSans.variable}>
      <body className="font-sans">
        <Header locale={locale} nav={dict.nav} />
        <main>{children}</main>
        <Footer locale={locale} dict={dict} />
      </body>
    </html>
  );
}
