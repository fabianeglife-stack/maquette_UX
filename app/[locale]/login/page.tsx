import LoginForm from "@/components/LoginForm";
import Reveal from "@/components/Reveal";
import { getDict, locales } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: getDict(locale).nav.portal };
}

export default async function Login({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDict(locale).login;

  return (
    <section className="mx-auto flex min-h-[85vh] max-w-6xl items-center justify-center px-6 pb-20 pt-32">
      <Reveal className="w-full max-w-md">
        <div className="flex flex-col gap-2 pb-8">
          <span className="label">{d.kicker}</span>
          <h1 className="text-3xl font-light tracking-tight text-ink md:text-4xl">{d.title}</h1>
          <p className="text-sm font-light leading-relaxed text-graphite">{d.lead}</p>
        </div>
        <LoginForm dict={d} locale={locale} />
        <p className="mt-8 border-t border-hairline pt-6 text-xs font-light leading-relaxed text-stone">
          {d.b2b}
        </p>
      </Reveal>
    </section>
  );
}
