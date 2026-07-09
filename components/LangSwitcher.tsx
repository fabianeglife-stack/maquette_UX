"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales } from "@/lib/i18n";

export default function LangSwitcher({
  locale,
  variant = "light",
}: {
  locale: string;
  variant?: "light" | "dark";
}) {
  const pathname = usePathname() || `/${locale}/`;

  const pathFor = (l: string) => {
    const parts = pathname.split("/").filter(Boolean);
    if (locales.includes(parts[0] as (typeof locales)[number])) parts[0] = l;
    else parts.unshift(l);
    return `/${parts.join("/")}/`;
  };

  const base =
    variant === "dark"
      ? { active: "text-paper", idle: "text-paper/60 hover:text-paper/80" }
      : { active: "text-ink", idle: "text-stone hover:text-graphite" };

  return (
    <nav aria-label="Language" className="flex items-center gap-3">
      {locales.map((l) => (
        <Link
          key={l}
          href={pathFor(l)}
          className={`text-[11px] font-medium uppercase tracking-[0.18em] transition-colors ${
            l === locale ? base.active : base.idle
          }`}
        >
          {l}
        </Link>
      ))}
    </nav>
  );
}
