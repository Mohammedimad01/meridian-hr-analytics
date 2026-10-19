"use client";

export interface TipRow {
  label: string;
  value: string;
  color?: string;
}

export interface TipModel {
  title: string;
  rows: TipRow[];
  note?: string;
}

interface RechartsTipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

/** Builds a Recharts `content` renderer from a datum -> TipModel function. */
export function tip<T>(render: (datum: T) => TipModel | null) {
  function TooltipContent({ active, payload }: RechartsTipProps) {
    if (!active || !payload?.length) return null;
    const datum = payload[0]?.payload as T | undefined;
    if (!datum) return null;
    const model = render(datum);
    if (!model) return null;
    return <TipCard model={model} />;
  }
  return TooltipContent;
}

export function TipCard({ model }: { model: TipModel }) {
  return (
    <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <p className="mb-1.5 font-medium">{model.title}</p>
      <dl className="grid gap-1">
        {model.rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden />}
              {r.label}
            </dt>
            <dd className="num font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
      {model.note && <p className="mt-1.5 border-t pt-1.5 text-muted-foreground">{model.note}</p>}
    </div>
  );
}
