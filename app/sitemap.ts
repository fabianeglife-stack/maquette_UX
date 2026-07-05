import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";

export const dynamic = "force-static";

const SITE = "https://fabianeglife-stack.github.io/maquette_UX";
const pages = ["", "about/", "references/", "configurator/", "login/", "imprint/", "privacy/", "terms/"];

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) =>
    pages.map((page) => ({
      url: `${SITE}/${locale}/${page}`,
      changeFrequency: "monthly" as const,
      priority: page === "" ? 1 : page === "configurator/" ? 0.9 : 0.6,
    })),
  );
}
