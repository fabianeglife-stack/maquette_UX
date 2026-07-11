"use client";

/* Content tab: CMS editors for the references, about and home pages. */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  mergedAbout,
  projectImages,
  type AboutContent,
  type ContentState,
  type HomeContent,
  type RefProject,
} from "@/lib/store";
import { fetchContent, fetchPageContent, putContent, putPageContent } from "@/lib/data";
import { fmt, type Dict } from "@/lib/i18n";
import { notify } from "@/lib/toast";
import type { AdminDict } from "./shared";

const emptyProject: RefProject = { name: "", place: "", system: "", length: "", mounting: "", desc: "" };

/** Read a photo and downscale it to a compact JPEG data URL (≤1280 px). */
function readProjectImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

const MAX_GALLERY = 8;

/** Multi-photo gallery editor: append, remove, reorder; first image is the cover. */
function GalleryEditor({
  c,
  images,
  onChange,
  max = MAX_GALLERY,
  label,
}: {
  c: AdminDict["content"];
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
        {label ?? c.image}
        {images.length > 0 && <span className="ml-2 text-stone/70">· {fmt(c.photoCount, { n: images.length })}</span>}
      </span>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-20 w-28 border border-hairline object-cover" />
              {i === 0 && (
                <span className="absolute left-0 top-0 bg-ink/85 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-paper">
                  {c.cover}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-ink/70 px-1 py-0.5 text-paper">
                <button
                  type="button"
                  aria-label={c.moveLeft}
                  disabled={i === 0}
                  onClick={() => {
                    const n = [...images];
                    [n[i - 1], n[i]] = [n[i], n[i - 1]];
                    onChange(n);
                  }}
                  className="px-1 text-sm leading-none disabled:opacity-30"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label={c.imageRemove}
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  className="px-1 text-sm leading-none hover:text-alert"
                >
                  ×
                </button>
                <button
                  type="button"
                  aria-label={c.moveRight}
                  disabled={i === images.length - 1}
                  onClick={() => {
                    const n = [...images];
                    [n[i + 1], n[i]] = [n[i], n[i + 1]];
                    onChange(n);
                  }}
                  className="px-1 text-sm leading-none disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {images.length < max && (
        <label className="cursor-pointer self-start border border-hairline px-4 py-2.5 text-xs uppercase tracking-[0.12em] text-graphite transition-colors hover:border-graphite">
          {images.length === 0 ? c.imagePick : c.imagesAdd}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []).slice(0, max - images.length);
              e.target.value = "";
              const added: string[] = [];
              for (const f of files) {
                try {
                  added.push(await readProjectImage(f));
                } catch {
                  /* skip unreadable file */
                }
              }
              if (added.length) onChange([...images, ...added]);
            }}
          />
        </label>
      )}
    </div>
  );
}

const inputCls =
  "w-full border border-hairline bg-paper px-3 py-2 text-sm font-light text-ink outline-none transition-colors placeholder:text-stone focus:border-graphite";

/** About page editor: every text field + the photo gallery, dict values as placeholders. */
function AboutEditor({ t, aboutDict }: { t: AdminDict; aboutDict: Dict["about"] }) {
  const c = t.content;
  const [o, setO] = useState<AboutContent>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetchPageContent<AboutContent>("about", {}).then(setO);
  }, []);

  const merged = mergedAbout(aboutDict, o);
  const lbl = "text-[11px] font-medium uppercase tracking-[0.14em] text-stone";

  const persist = (next: AboutContent) => {
    putPageContent("about", next)
      .then(() => {
        setO(next);
        setSaved(true);
      })
      .catch(() => notify("saveFailed"));
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="text-sm font-light leading-relaxed text-graphite">{c.aboutHint}</p>

      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fKicker}</span>
        <input value={o.kicker ?? ""} placeholder={aboutDict.kicker} onChange={(e) => setO({ ...o, kicker: e.target.value })} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fTitle}</span>
        <input value={o.title ?? ""} placeholder={aboutDict.title} onChange={(e) => setO({ ...o, title: e.target.value })} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fLead}</span>
        <textarea rows={2} value={o.lead ?? ""} placeholder={aboutDict.lead} onChange={(e) => setO({ ...o, lead: e.target.value })} className={inputCls} />
      </label>

      {aboutDict.story.map((def, i) => (
        <label key={i} className="flex flex-col gap-1.5">
          <span className={lbl}>{fmt(c.fStory, { n: i + 1 })}</span>
          <textarea
            rows={3}
            value={merged.story[i] ?? ""}
            onChange={(e) => {
              const story = [...merged.story];
              story[i] = e.target.value;
              setO({ ...o, story });
            }}
            className={inputCls}
          />
        </label>
      ))}

      <div className="flex flex-col gap-3">
        <span className={lbl}>{c.fValues}</span>
        {merged.values.map((v, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input
              value={v.t}
              onChange={(e) => {
                const values = merged.values.map((x, j) => (j === i ? { ...x, t: e.target.value } : x));
                setO({ ...o, values });
              }}
              className={inputCls}
            />
            <input
              value={v.d}
              onChange={(e) => {
                const values = merged.values.map((x, j) => (j === i ? { ...x, d: e.target.value } : x));
                setO({ ...o, values });
              }}
              className={inputCls}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <span className={lbl}>{c.fNumbers}</span>
        {merged.numbers.map((n, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input
              value={n.v}
              onChange={(e) => {
                const numbers = merged.numbers.map((x, j) => (j === i ? { ...x, v: e.target.value } : x));
                setO({ ...o, numbers });
              }}
              className={inputCls}
            />
            <input
              value={n.d}
              onChange={(e) => {
                const numbers = merged.numbers.map((x, j) => (j === i ? { ...x, d: e.target.value } : x));
                setO({ ...o, numbers });
              }}
              className={inputCls}
            />
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fQuote}</span>
        <textarea rows={2} value={o.quote ?? ""} placeholder={aboutDict.quote} onChange={(e) => setO({ ...o, quote: e.target.value })} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={lbl}>{c.fQuoteAuthor}</span>
        <input value={o.quoteAuthor ?? ""} placeholder={aboutDict.quoteAuthor} onChange={(e) => setO({ ...o, quoteAuthor: e.target.value })} className={inputCls} />
      </label>

      <GalleryEditor c={c} label={c.fGallery} images={o.images ?? []} onChange={(images) => setO({ ...o, images })} />

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="button"
          onClick={() => persist(o)}
          className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => persist({})}
          className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite"
        >
          {c.resetPage}
        </button>
      </div>
      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {c.savedMsg}
        </p>
      )}
    </div>
  );
}

/** Home page editor: hero photo (references photos flow to the teaser automatically). */
function HomeEditor({ t }: { t: AdminDict }) {
  const c = t.content;
  const [o, setO] = useState<HomeContent>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetchPageContent<HomeContent>("home", {}).then(setO);
  }, []);

  const persist = (next: HomeContent) => {
    putPageContent("home", next)
      .then(() => {
        setO(next);
        setSaved(true);
      })
      .catch(() => notify("saveFailed"));
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="text-sm font-light leading-relaxed text-graphite">{c.homeHint}</p>
      <GalleryEditor
        c={c}
        label={c.heroImage}
        max={1}
        images={o.heroImage ? [o.heroImage] : []}
        onChange={(images) => setO({ ...o, heroImage: images[0] })}
      />
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="button"
          onClick={() => persist(o)}
          className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => persist({})}
          className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite"
        >
          {c.resetPage}
        </button>
      </div>
      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {c.savedMsg}
        </p>
      )}
    </div>
  );
}

function ReferencesEditor({ t, refsDict, locale }: { t: AdminDict; refsDict: Dict["references"]; locale: string }) {
  const c = t.content;
  const [content, setContent] = useState<ContentState>({ projects: {}, added: [] });
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<RefProject>(emptyProject);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchContent().then(setContent);
  }, []);

  const base = refsDict.projects as RefProject[];
  const combined: RefProject[] = [...base.map((p, i) => ({ ...p, ...(content.projects[i] ?? {}) })), ...content.added];

  const persist = (next: ContentState) => {
    putContent(next)
      .then(() => fetchContent())
      .then((c) => {
        setContent(c);
        setEditing(null);
        setSaved(true);
      })
      .catch(() => notify("saveFailed"));
  };

  const submit = () => {
    if (editing === "new") {
      persist({ ...content, added: [...content.added, draft] });
    } else if (typeof editing === "number" && editing < base.length) {
      persist({ ...content, projects: { ...content.projects, [editing]: draft } });
    } else if (typeof editing === "number") {
      const added = [...content.added];
      added[editing - base.length] = draft;
      persist({ ...content, added });
    }
  };

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 border border-ink/60 p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input required placeholder={c.name} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
        <input required placeholder={c.place} value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} className={inputCls} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input required placeholder={c.system} value={draft.system} onChange={(e) => setDraft({ ...draft, system: e.target.value })} className={inputCls} />
        <input required placeholder={c.length} value={draft.length} onChange={(e) => setDraft({ ...draft, length: e.target.value })} className={inputCls} />
        <input required placeholder={c.mounting} value={draft.mounting} onChange={(e) => setDraft({ ...draft, mounting: e.target.value })} className={inputCls} />
      </div>
      <textarea
        required
        rows={2}
        placeholder={c.desc}
        value={draft.desc}
        onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
        className={inputCls}
      />
      <GalleryEditor c={c} images={projectImages(draft)} onChange={(images) => setDraft((d) => ({ ...d, images, image: undefined }))} />
      <div className="flex gap-3">
        <button type="submit" className="inline-flex items-center justify-center bg-ink px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-graphite">
          {c.save}
        </button>
        <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center justify-center border border-hairline px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-graphite transition-colors hover:border-graphite">
          {c.cancel}
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-2xl text-sm font-light leading-relaxed text-graphite">{c.hint}</p>
        <Link href={`/${locale}/references/`} className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-graphite underline-offset-4 hover:text-ink hover:underline">
          {c.viewPage} →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {combined.map((p, i) =>
          editing === i ? (
            <div key={i} className="sm:col-span-2">
              {form}
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-2 border border-hairline p-5">
              {projectImages(p).length > 0 && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={projectImages(p)[0]} alt={p.name} className="aspect-[16/9] w-full border border-hairline object-cover" />
                  {projectImages(p).length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-ink/80 px-2 py-0.5 text-[10px] font-light text-paper">
                      {fmt(c.photoCount, { n: projectImages(p).length })}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{p.name}</span>
                {i >= base.length && (
                  <span className="border border-steel/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-steel">{c.customBadge}</span>
                )}
              </div>
              <p className="text-xs font-light text-stone">
                {p.place} · {p.system} · {p.length}
              </p>
              <p className="text-xs font-light leading-relaxed text-graphite">{p.desc}</p>
              <div className="flex gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(p);
                    setEditing(i);
                    setSaved(false);
                  }}
                  className="text-[11px] uppercase tracking-[0.12em] text-graphite underline-offset-2 hover:text-ink hover:underline"
                >
                  {c.edit}
                </button>
                {i >= base.length && (
                  <button
                    type="button"
                    onClick={() => persist({ ...content, added: content.added.filter((_, j) => j !== i - base.length) })}
                    className="text-[11px] uppercase tracking-[0.12em] text-alert underline-offset-2 hover:underline"
                  >
                    {c.delete}
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {editing === "new" ? (
        form
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyProject);
            setEditing("new");
            setSaved(false);
          }}
          className="self-start border border-dashed border-hairline px-5 py-3 text-left text-sm text-graphite transition-colors hover:border-graphite"
        >
          + {c.addProject}
        </button>
      )}

      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {c.savedMsg}
        </p>
      )}
    </div>
  );
}

/** Inhalte tab: section switcher over the three CMS-editable pages. */
export default function ContentTab({
  t,
  refsDict,
  aboutDict,
  locale,
}: {
  t: AdminDict;
  refsDict: Dict["references"];
  aboutDict: Dict["about"];
  locale: string;
}) {
  const [section, setSection] = useState<"references" | "about" | "home">("references");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-px self-start bg-hairline">
        {(["references", "about", "home"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setSection(v)}
            className={`px-4 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors ${
              section === v ? "bg-ink text-paper" : "bg-paper text-graphite hover:text-ink"
            }`}
          >
            {t.content.sections[v]}
          </button>
        ))}
      </div>
      {section === "references" && <ReferencesEditor t={t} refsDict={refsDict} locale={locale} />}
      {section === "about" && <AboutEditor t={t} aboutDict={aboutDict} />}
      {section === "home" && <HomeEditor t={t} />}
    </div>
  );
}
