"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceArea, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { tip, type TipModel } from "./tooltip";

export interface ColumnSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Vertical bars over a category axis (usually months). Grouped by default,
 * stacked when `stacked` is set. Optional `highlight(datum)` dims the rest.
 */
export function ColumnChart<T extends { label: string }>({
  data,
  series,
  stacked = false,
  height = 240,
  format,
  tooltip,
  highlight,
  showTotals = false,
  bands = [],
}: {
  data: T[];
  series: ColumnSeries[];
  stacked?: boolean;
  height?: number;
  format: (v: number) => string;
  tooltip: (d: T) => TipModel;
  highlight?: (d: T) => boolean;
  showTotals?: boolean;
  /** Shaded annotation ranges on the category axis, e.g. a seasonal window. */
  bands?: { x1: string; x2: string; label: string }[];
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) satisfies ChartConfig;
  const Tip = tip<T>(tooltip);
  const lastKey = series[series.length - 1]?.key;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart
        data={data}
        margin={{ top: showTotals || bands.length ? 18 : 8, right: 4, bottom: 0, left: 0 }}
        barGap={2}
        barCategoryGap={stacked ? "28%" : "22%"}
        accessibilityLayer
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} width={40} tickMargin={4} allowDecimals={false} tickFormatter={(v: number) => format(v)} />
        {bands.map((b) => (
          <ReferenceArea
            key={b.x1}
            x1={b.x1}
            x2={b.x2}
            fill="var(--chart-muted)"
            fillOpacity={0.6}
            ifOverflow="extendDomain"
          />
        ))}
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={Tip} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={`var(--color-${s.key})`}
            stackId={stacked ? "a" : undefined}
            radius={stacked ? (s.key === lastKey ? [3, 3, 0, 0] : [0, 0, 0, 0]) : [3, 3, 0, 0]}
            maxBarSize={stacked ? 28 : 14}
            isAnimationActive={false}
            stroke={stacked ? "var(--card)" : undefined}
            strokeWidth={stacked ? 1 : 0}
          >
            {highlight &&
              data.map((d, i) => <Cell key={i} fillOpacity={highlight(d) ? 1 : 0.45} />)}
            {showTotals && s.key === lastKey && (
              <LabelList
                position="top"
                offset={6}
                className="num fill-muted-foreground"
                fontSize={11}
                valueAccessor={(entry: { payload?: Record<string, unknown> }) => {
                  const p = entry.payload ?? {};
                  const total = series.reduce((sum, x) => sum + (Number(p[x.key]) || 0), 0);
                  return format(total);
                }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  );
}
