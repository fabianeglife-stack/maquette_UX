import Link from "next/link";
import LangSwitcher from "./LangSwitcher";
import Wordmark from "./Wordmark";
import type { Dict } from "@/lib/i18n";

export default function Footer({ locale, dict }: { locale: string; dict: Dict }) {
  const f = dict.footer;
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-5">
            <Wordmark variant="dark" />
            <p className="max-w-xs text-sm font-light leading-relaxed text-paper/60">{f.claim}</p>
          </div>

          <div className="flex flex-col gap-3">
            <span className="label !text-paper/40">{f.sections}</span>
            <Link href={`/${locale}/about/`} className="text-sm font-light text-paper/70 hover:text-paper">
              {dict.nav.about}
            </Link>
            <Link href={`/${locale}/references/`} className="text-sm font-light text-paper/70 hover:text-paper">
              {dict.nav.references}
            </Link>
            <Link href={`/${locale}/configurator/`} className="text-sm font-light text-paper/70 hover:text-paper">
              {dict.nav.configurator}
            </Link>
            <Link href={`/${locale}/login/`} className="text-sm font-light text-paper/70 hover:text-paper">
              {dict.nav.portal}
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <span className="label !text-paper/40">{f.contact}</span>
            <span className="text-sm font-light text-paper/70">AxioForm AG</span>
            <span className="text-sm font-light text-paper/70">Werkstrasse 12, 6300 Zug</span>
            <a href="mailto:hello@axioform.ch" className="text-sm font-light text-paper/70 hover:text-paper">
              hello@axioform.ch
            </a>
          </div>

          <div className="flex flex-col gap-3">
            <span className="label !text-paper/40">{f.legal}</span>
            <span className="cursor-default text-sm font-light text-paper/70">{f.imprint}</span>
            <span className="cursor-default text-sm font-light text-paper/70">{f.privacy}</span>
            <span className="cursor-default text-sm font-light text-paper/70">{f.terms}</span>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-paper/10 pt-6 md:flex-row md:items-center md:justify-between">
          <span className="text-xs font-light text-paper/40">
            © {new Date().getFullYear()} AxioForm AG · {f.proto}
          </span>
          <LangSwitcher locale={locale} variant="dark" />
        </div>
      </div>
    </footer>
  );
}
