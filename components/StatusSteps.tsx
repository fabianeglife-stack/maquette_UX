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
  return (
    <div className="flex items-center gap-1.5">
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
