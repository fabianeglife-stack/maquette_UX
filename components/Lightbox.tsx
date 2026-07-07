"use client";

import { useCallback, useEffect, useState } from "react";

/** Fullscreen image carousel overlay. Keyboard ←/→/Esc, click-outside to close. */
export default function Lightbox({
  images,
  start = 0,
  alt = "",
  labels,
  onClose,
}: {
  images: string[];
  start?: number;
  alt?: string;
  labels: { close: string; prev: string; next: string };
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const n = images.length;
  const go = useCallback((d: number) => setI((c) => (c + d + n) % n), [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [go, onClose]);

  if (n === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label={labels.close}
        onClick={onClose}
        className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center text-2xl font-light text-paper/80 transition-colors hover:text-paper"
      >
        ×
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[i]}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[92vw] object-contain shadow-2xl"
      />

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label={labels.prev}
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-4 flex h-12 w-12 items-center justify-center text-3xl font-light text-paper/70 transition-colors hover:text-paper"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={labels.next}
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-4 flex h-12 w-12 items-center justify-center text-3xl font-light text-paper/70 transition-colors hover:text-paper"
          >
            ›
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs font-light tracking-[0.2em] text-paper/70">
            {i + 1} / {n}
          </div>
        </>
      )}
    </div>
  );
}
