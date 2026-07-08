"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Reveal from "@/components/Reveal";
import { ReferenceScene } from "@/components/illustrations";
import { projectImages, type RefProject } from "@/lib/store";
import { fetchMergedProjects } from "@/lib/data";
import type { Dict } from "@/lib/i18n";

/** Home references teaser: first three projects, uploaded photos when available. */
export default function HomeRefsTeaser({ base, locale }: { base: Dict["references"]["projects"]; locale: string }) {
  const [projects, setProjects] = useState<RefProject[]>(base.slice(0, 3));

  useEffect(() => {
    fetchMergedProjects(base).then((all) => setProjects(all.slice(0, 3)));
  }, [base]);

  return (
    <div className="mt-14 grid gap-8 md:grid-cols-3">
      {projects.map((p, i) => {
        const imgs = projectImages(p);
        return (
          <Reveal key={`${i}-${p.name}`} delay={i * 120} className="group flex flex-col gap-4">
            <Link href={`/${locale}/references/`} className="flex flex-col gap-4">
              {imgs.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgs[0]}
                  alt={p.name}
                  className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="bg-mist/60 p-4 transition-colors group-hover:bg-mist">
                  <ReferenceScene index={i} />
                </div>
              )}
              <div>
                <h3 className="text-base font-normal text-ink">{p.name}</h3>
                <p className="text-sm font-light text-stone">
                  {p.place} · {p.system}
                </p>
              </div>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}
