import Link from "next/link";
import Reveal from "./Reveal";

export function SectionHeader({
  kicker,
  title,
  lead,
  dark = false,
}: {
  kicker: string;
  title: string;
  lead?: string;
  dark?: boolean;
}) {
  return (
    <Reveal className="flex max-w-2xl flex-col gap-5">
      <span className={`label ${dark ? "!text-paper/40" : ""}`}>{kicker}</span>
      <h2
        className={`text-3xl font-light leading-tight tracking-tight md:text-[2.75rem] md:leading-[1.15] ${
          dark ? "text-paper" : "text-ink"
        }`}
      >
        {title}
      </h2>
      {lead && (
        <p className={`text-base font-light leading-relaxed md:text-lg ${dark ? "text-paper/60" : "text-graphite"}`}>
          {lead}
        </p>
      )}
    </Reveal>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  dark = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  dark?: boolean;
}) {
  const styles =
    variant === "primary"
      ? dark
        ? "bg-paper text-ink hover:bg-mist"
        : "bg-ink text-paper hover:bg-graphite"
      : dark
        ? "border border-paper/30 text-paper hover:border-paper hover:bg-paper hover:text-ink"
        : "border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-paper";
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center px-5 py-3.5 text-xs font-medium uppercase tracking-[0.16em] transition-colors ${styles}`}
    >
      {children}
    </Link>
  );
}
