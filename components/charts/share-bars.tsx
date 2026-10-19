"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { tip, type TipModel } from "./tooltip";

export interface ShareDatum {
  label: string;
  /** Share of the first segment, 0-100. */
  a: number;
  /** Share of the second segment, 0-100. */
  b: number;
}

/** 100% stacked horizontal bars for a two-part split (e.g. gender mix). */
export function ShareBars<T extends ShareDatum>({
  data,
  aLabel,
  bLabel,
  tooltip,
  labelWidth = 92,
}: {
  data: T[];
  aLabel: string;
  bLabel: string;
  tooltip: (d: T) => TipModel;
  labelWidth?: number;
}) {
  const config = {
    a: { label: aLabel, color: "var(--chart-1)" },
    b: { label: bLabel, color: "var(--chart-2)" },
  } satisfies ChartConfig;
  const Tip = tip<T>(tooltip);
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(120, data.length * 30 + 28) }}>
      <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%" accessibilityLayer>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} ticks={[0, 0.25, 0.5, 0.75, 1]} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={labelWidth} tick={{ fontSize: 12 }} interval={0} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={Tip} />
        <Bar dataKey="a" stackId="s" fill="var(--color-a)" maxBarSize={18} isAnimationActive={false} stroke="var(--card)" strokeWidth={1} />
        <Bar dataKey="b" stackId="s" fill="var(--color-b)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} stroke="var(--card)" strokeWidth={1} />
      </BarChart>
    </ChartContainer>
  );
}
