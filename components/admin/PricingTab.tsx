"use client";

/* Pricing tab: edit the price book field by field and publish a new version. */

import { useEffect, useState } from "react";
import { defaultPriceBook, type PriceBook } from "@/lib/engine/pricing";
import { fetchPriceBook, publishPriceBook, resetPriceBookAll } from "@/lib/data";
import { notify } from "@/lib/toast";
import type { AdminDict } from "./shared";

export default function PricingTab({ t }: { t: AdminDict }) {
  const [pb, setPb] = useState<PriceBook>(defaultPriceBook);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPriceBook().then(setPb);
  }, []);

  const fields: { key: string; label: string; get: () => number; set: (v: number) => void }[] = [
    { key: "basePerM", label: t.fields.basePerM, get: () => pb.basePerM, set: (v) => setPb({ ...pb, basePerM: v }) },
    { key: "glassBasePerM", label: t.fields.glassBasePerM, get: () => pb.glassBasePerM, set: (v) => setPb({ ...pb, glassBasePerM: v }) },
    { key: "glassFreeEdgePerM", label: t.fields.glassFreeEdgePerM, get: () => pb.glassFreeEdgePerM, set: (v) => setPb({ ...pb, glassFreeEdgePerM: v }) },
    { key: "glassSatin", label: t.fields.glassSatin, get: () => pb.glassTypePerM.satin, set: (v) => setPb({ ...pb, glassTypePerM: { ...pb.glassTypePerM, satin: v } }) },
    { key: "glassTinted", label: t.fields.glassTinted, get: () => pb.glassTypePerM.tinted, set: (v) => setPb({ ...pb, glassTypePerM: { ...pb.glassTypePerM, tinted: v } }) },
    { key: "hrFlat", label: t.fields.hrFlat, get: () => pb.handrailPerM.flat_steel, set: (v) => setPb({ ...pb, handrailPerM: { ...pb.handrailPerM, flat_steel: v } }) },
    { key: "hrInox", label: t.fields.hrInox, get: () => pb.handrailPerM.round_inox, set: (v) => setPb({ ...pb, handrailPerM: { ...pb.handrailPerM, round_inox: v } }) },
    { key: "colorCustom", label: t.fields.colorCustom, get: () => pb.colorPerM.custom, set: (v) => setPb({ ...pb, colorPerM: { ...pb.colorPerM, custom: v } }) },
    { key: "stairPerM", label: t.fields.stairPerM, get: () => pb.stairPerM, set: (v) => setPb({ ...pb, stairPerM: v }) },
    { key: "sideMountPerM", label: t.fields.sideMountPerM, get: () => pb.sideMountPerM, set: (v) => setPb({ ...pb, sideMountPerM: v }) },
    { key: "publicPerM", label: t.fields.publicPerM, get: () => pb.publicUsagePerM, set: (v) => setPb({ ...pb, publicUsagePerM: v }) },
    { key: "cornerEach", label: t.fields.cornerEach, get: () => pb.cornerEach, set: (v) => setPb({ ...pb, cornerEach: v }) },
    { key: "cornerEachGlass", label: t.fields.cornerEachGlass, get: () => pb.cornerEachGlass, set: (v) => setPb({ ...pb, cornerEachGlass: v }) },
    { key: "setupFee", label: t.fields.setupFee, get: () => pb.setupFee, set: (v) => setPb({ ...pb, setupFee: v }) },
    { key: "shippingFlat", label: t.fields.shippingFlat, get: () => pb.shippingFlat, set: (v) => setPb({ ...pb, shippingFlat: v }) },
    { key: "freeShippingFrom", label: t.fields.freeShippingFrom, get: () => pb.freeShippingFrom, set: (v) => setPb({ ...pb, freeShippingFrom: v }) },
    { key: "vatPct", label: t.fields.vatPct, get: () => Math.round(pb.vatRate * 1000) / 10, set: (v) => setPb({ ...pb, vatRate: v / 100 }) },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm font-light leading-relaxed text-graphite">{t.pricingHint}</p>
      <p className="text-xs font-light text-stone">
        {t.version}: <span className="text-ink">{pb.version}</span>
      </p>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">{f.label}</span>
            <span className="flex items-center border border-hairline bg-paper focus-within:border-graphite">
              <input
                type="number"
                value={f.get()}
                step={1}
                min={0}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) {
                    f.set(n);
                    setSaved(false);
                  }
                }}
                className="w-full bg-transparent px-3 py-2 text-sm font-light text-ink outline-none"
              />
              <span className="pr-3 text-xs text-stone">{f.key === "vatPct" ? "%" : "CHF"}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            publishPriceBook(pb)
              .then((next) => {
                setPb(next);
                setSaved(true);
              })
              .catch(() => notify("saveFailed"));
          }}
          className="inline-flex items-center justify-center bg-ink px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-paper transition-colors hover:bg-graphite"
        >
          {t.save}
        </button>
        <button
          type="button"
          onClick={() => {
            resetPriceBookAll()
              .then((next) => {
                setPb(next);
                setSaved(false);
              })
              .catch(() => notify("saveFailed"));
          }}
          className="inline-flex items-center justify-center border border-ink/25 px-6 py-3 text-xs font-medium uppercase tracking-[0.16em] text-ink transition-colors hover:border-ink"
        >
          {t.reset}
        </button>
      </div>
      {saved && (
        <p role="status" className="border-l-2 border-steel bg-mist/70 p-3 text-sm font-light text-graphite">
          {t.savedMsg}
        </p>
      )}
    </div>
  );
}
