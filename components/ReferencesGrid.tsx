"use client";

import { useEffect, useState } from "react";
import Reveal from "@/components/Reveal";
import { ReferenceScene } from "@/components/illustrations";
import type { RefProject } from "@/lib/store";
import { fetchMergedProjects } from "@/lib/data";
import type { Dict } from "@/lib/i18n";

export default function ReferencesGrid({ d }: { d: Dict["references"] }) {
  // Server-rendered with the seeded projects; admin CMS overrides are merged
  // in after mount (from the API in server mode, this browser otherwise).
  const [projects, setProjects] = useState<RefProject[]>(d.projects);

  useEffect(() => {
    fetchMergedProjects(d.projects).then(setProjects);
  }, [d.projects]);

  return (
    <div className="grid gap-14 md:grid-cols-2 md:gap-x-10 md:gap-y-20">
      {projects.map((p, i) => (
        <Reveal key={`${i}-${p.name}`} delay={(i % 2) * 120} className="flex flex-col gap-5">
          <div className="bg-mist/60 p-5">
            <ReferenceScene index={i % 6} />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-normal tracking-tight text-ink">{p.name}</h2>
            <span className="text-sm font-light text-stone">{p.place}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-hairline pt-4">
            <dt className="text-xs uppercase tracking-[0.14em] text-stone">{d.labels.system}</dt>
            <dd className="text-sm font-light text-graphite">{p.system}</dd>
            <dt className="text-xs uppercase tracking-[0.14em] text-stone">{d.labels.length}</dt>
            <dd className="text-sm font-light text-graphite">{p.length}</dd>
            <dt className="text-xs uppercase tracking-[0.14em] text-stone">{d.labels.mounting}</dt>
            <dd className="text-sm font-light text-graphite">{p.mounting}</dd>
          </dl>
          <p className="text-sm font-light leading-relaxed text-graphite">{p.desc}</p>
        </Reveal>
      ))}
    </div>
  );
}
