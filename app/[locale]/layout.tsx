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
    metadataBase: new URL("https://fabianeglife-stack.github.io/maquette_UX"),
    title: {
      default: "AxioForm — " + dict.hero.title,
      template: "%s — AxioForm",
    },
    description: dict.hero.lead,
    icons: {
      icon: [
        { url: `${basePath}/favicon.svg`, type: "image/svg+xml" },
        { url: `${basePath}/icon-192.png`, type: "image/png", sizes: "192x192" },
      ],
      apple: `${basePath}/apple-touch-icon.png`,
    },
    openGraph: {
      siteName: "AxioForm",
      type: "website",
      locale,
      title: "AxioForm — " + dict.hero.title,
      description: dict.hero.lead,
      images: [{ url: `${basePath}/og.png`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "AxioForm — " + dict.hero.title,
      description: dict.hero.lead,
      images: [`${basePath}/og.png`],
    },
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
        <a href="#main" className="skip-link">
          {dict.nav.skip}
        </a>
        <Header locale={locale} nav={dict.nav} />
        <main id="main">{children}</main>
        <Footer locale={locale} dict={dict} />
      </body>
    </html>
  );
}
