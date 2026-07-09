"use client";

import { useEffect, useState } from "react";
import Reveal from "@/components/Reveal";
import Lightbox from "@/components/Lightbox";
import { mergedAbout, type AboutContent } from "@/lib/store";
import { fetchPageContent } from "@/lib/data";
import type { Dict } from "@/lib/i18n";

/**
 * About page body. Server-rendered with the i18n defaults, then admin CMS
 * overrides (texts + photo gallery) are merged in after mount — the same
 * pattern as ReferencesGrid.
 */
export default function AboutSections({ d, gallery }: { d: Dict["about"]; gallery: Dict["references"]["gallery"] }) {
  const [c, setC] = useState(() => mergedAbout(d, {}));
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    fetchPageContent<AboutContent>("about", {}).then((o) => setC(mergedAbout(d, o)));
  }, [d]);

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-36 md:pt-44">
        <Reveal className="flex max-w-3xl flex-col gap-6">
          <span className="label">{c.kicker}</span>
          <h1 className="text-4xl font-light leading-[1.12] tracking-tight text-ink md:text-5xl">{c.title}</h1>
          <p className="text-lg font-light leading-relaxed text-graphite">{c.lead}</p>
        </Reveal>
      </section>

      <section className="hairline-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:py-28">
          {c.story.map((p, i) => (
            <Reveal key={i} delay={i * 120}>
              <p className="text-base font-light leading-relaxed text-graphite">{p}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {c.images.length > 0 && (
        <section className="hairline-t">
          <div className="mx-auto grid max-w-6xl gap-4 px-6 py-16 sm:grid-cols-2 md:grid-cols-3 md:py-20">
            {c.images.map((src, i) => (
              <Reveal key={i} delay={i * 100}>
                <button
                  type="button"
                  onClick={() => setLightbox(i)}
                  className="group block aspect-[4/3] w-full overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${c.title} — ${i + 1}`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </button>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="hairline-t">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="grid gap-px bg-hairline md:grid-cols-2">
            {c.values.map((v, i) => (
              <Reveal key={`${i}-${v.t}`} delay={i * 80} className="flex flex-col gap-3 bg-paper p-8 md:p-12">
                <span className="text-xs text-graphite">0{i + 1}</span>
                <h2 className="text-xl font-normal tracking-tight text-ink">{v.t}</h2>
                <p className="text-sm font-light leading-relaxed text-graphite">{v.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink">
        <div className="mx-auto grid max-w-6xl gap-px bg-paper/10 px-6 py-20 md:grid-cols-4 md:py-24">
          {c.numbers.map((n, i) => (
            <Reveal key={`${i}-${n.d}`} delay={i * 80} className="flex flex-col gap-3 bg-ink p-8 md:p-10">
              <span className="text-4xl font-light tracking-tight text-paper">{n.v}</span>
              <p className="text-sm font-light leading-relaxed text-paper/55">{n.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-24 text-center md:py-32">
          <Reveal className="flex flex-col items-center gap-6">
            <p className="max-w-3xl text-2xl font-light leading-snug tracking-tight text-ink md:text-3xl">{c.quote}</p>
            <span className="label">{c.quoteAuthor}</span>
          </Reveal>
        </div>
      </section>

      {lightbox !== null && (
        <Lightbox images={c.images} start={lightbox} labels={gallery} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}
