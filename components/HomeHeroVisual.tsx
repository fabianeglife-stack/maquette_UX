"use client";

import { useEffect, useState } from "react";
import { HeroScene } from "@/components/illustrations";
import { fetchPageContent } from "@/lib/data";
import type { HomeContent } from "@/lib/store";

/** Hero visual: the admin-uploaded photo when set, else the illustration. */
export default function HomeHeroVisual() {
  const [heroImage, setHeroImage] = useState<string | null>(null);

  useEffect(() => {
    fetchPageContent<HomeContent>("home", {}).then((c) => setHeroImage(c.heroImage ?? null));
  }, []);

  if (heroImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={heroImage} alt="" className="aspect-[4/3] w-full object-cover" />
    );
  }
  return <HeroScene />;
}
