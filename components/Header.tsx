"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LangSwitcher from "./LangSwitcher";
import Wordmark from "./Wordmark";
import type { Dict } from "@/lib/i18n";

export default function Header({ locale, nav }: { locale: string; nav: Dict["nav"] }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: `/${locale}/about/`, label: nav.about },
    { href: `/${locale}/references/`, label: nav.references },
    { href: `/${locale}/configurator/`, label: nav.configurator },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled || open
          ? "border-b border-hairline bg-paper/90 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:h-20">
        <Link href={`/${locale}/`} onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-xs uppercase tracking-[0.16em] text-graphite transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-6 md:flex">
          <LangSwitcher locale={locale} />
          <Link
            href={`/${locale}/login/`}
            className="border border-ink/25 px-4 py-2 text-xs uppercase tracking-[0.16em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
          >
            {nav.portal}
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          aria-label="Menu"
          onClick={() => setOpen(!open)}
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
        >
          <span
            className={`h-px w-6 bg-ink transition-transform ${open ? "translate-y-[3.5px] rotate-45" : ""}`}
          />
          <span
            className={`h-px w-6 bg-ink transition-transform ${open ? "-translate-y-[3.5px] -rotate-45" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="border-t border-hairline bg-paper px-6 pb-8 pt-4 md:hidden">
          <nav className="flex flex-col gap-5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm uppercase tracking-[0.16em] text-graphite"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href={`/${locale}/login/`}
              onClick={() => setOpen(false)}
              className="text-sm uppercase tracking-[0.16em] text-graphite"
            >
              {nav.portal}
            </Link>
            <div className="pt-2">
              <LangSwitcher locale={locale} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
