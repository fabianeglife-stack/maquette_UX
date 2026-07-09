"use client";

import { useEffect, useState } from "react";
import Reveal from "@/components/Reveal";
import Lightbox from "@/components/Lightbox";
import { ReferenceScene } from "@/components/illustrations";
import { projectImages, type RefProject } from "@/lib/store";
import { fetchMergedProjects } from "@/lib/data";
import type { Dict } from "@/lib/i18n";

export default function ReferencesGrid({ d }: { d: Dict["references"] }) {
  // Server-rendered with the seeded projects; admin CMS overrides are merged
  // in after mount (from the API in server mode, this browser otherwise).
  const [projects, setProjects] = useState<RefProject[]>(d.projects);
  const [gallery, setGallery] = useState<{ images: string[]; alt: string } | null>(null);

  useEffect(() => {
    fetchMergedProjects(d.projects).then(setProjects);
  }, [d.projects]);

  return (
    <>
      <div className="grid gap-14 md:grid-cols-2 md:gap-x-10 md:gap-y-20">
        {projects.map((p, i) => {
          const imgs = projectImages(p);
          return (
            <Reveal key={`${i}-${p.name}`} delay={(i % 2) * 120} className="flex flex-col gap-5">
              {imgs.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setGallery({ images: imgs, alt: p.name })}
                  className="group relative block aspect-[4/3] w-full overflow-hidden"
                  aria-label={p.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgs[0]}
                    alt={p.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  {imgs.length > 1 && (
                    <span className="absolute bottom-3 right-3 bg-ink/80 px-2.5 py-1 text-[11px] font-light tracking-[0.1em] text-paper">
                      +{imgs.length - 1}
                    </span>
                  )}
                </button>
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-mist/60 p-6">
                  <ReferenceScene index={i % 6} />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-normal tracking-tight text-ink">{p.name}</h2>
                <span className="text-sm font-light text-graphite">{p.place}</span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-hairline pt-4">
                <dt className="text-xs uppercase tracking-[0.14em] text-graphite">{d.labels.system}</dt>
                <dd className="text-sm font-light text-graphite">{p.system}</dd>
                <dt className="text-xs uppercase tracking-[0.14em] text-graphite">{d.labels.length}</dt>
                <dd className="text-sm font-light text-graphite">{p.length}</dd>
                <dt className="text-xs uppercase tracking-[0.14em] text-graphite">{d.labels.mounting}</dt>
                <dd className="text-sm font-light text-graphite">{p.mounting}</dd>
              </dl>
              <p className="text-sm font-light leading-relaxed text-graphite">{p.desc}</p>
            </Reveal>
          );
        })}
      </div>

      {gallery && (
        <Lightbox
          images={gallery.images}
          alt={gallery.alt}
          labels={{ close: d.gallery.close, prev: d.gallery.prev, next: d.gallery.next }}
          onClose={() => setGallery(null)}
        />
      )}
    </>
  );
}
