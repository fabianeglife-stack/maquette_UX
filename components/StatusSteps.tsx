import type { OrderStatus } from "@/lib/store";
import type { Dict } from "@/lib/i18n";

/** Visual order/quote status pipeline: dots + connectors, current step labelled. */
export default function StatusSteps({
  status,
  flow,
  labels,
  showLabel = true,
}: {
  status: OrderStatus;
  flow: OrderStatus[];
  labels: Dict["portal"]["status"];
  showLabel?: boolean;
}) {
  const idx = flow.indexOf(status);
  // Cancelled sits outside the linear flow: a plain terminal chip, no pipeline.
  if (status === "cancelled") {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-stone/40 bg-mist/60 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-stone">
        <span className="h-1.5 w-1.5 rounded-full bg-stone" />
        {labels.cancelled}
      </span>
    );
  }
  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`${labels[status]} (${idx + 1}/${flow.length})`}
    >
      {flow.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <span title={labels[s]} className={`h-2 w-2 rounded-full ${i <= idx ? "bg-ink" : "bg-hairline"}`} />
          {i < flow.length - 1 && <span className={`h-px w-5 ${i < idx ? "bg-ink" : "bg-hairline"}`} />}
        </div>
      ))}
      {showLabel && <span className="pl-2 text-xs font-light text-graphite">{labels[status]}</span>}
    </div>
  );
}
