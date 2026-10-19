"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { tip, type TipModel } from "./tooltip";

export interface RankedDatum {
  key: string;
  label: string;
  value: number;
  /** Drawn in the accent colour; everything else is neutral. */
  highlight?: boolean;
}

const config = { value: { label: "Value", color: "var(--chart-1)" } } satisfies ChartConfig;

/**
 * Horizontal ranked bars with direct value labels. One accent for the
 * highlighted bar(s), neutral for the rest, optional dashed reference line.
 */
export function RankedBars<T extends RankedDatum>({
  data,
  format,
  axisFormat = format,
  tooltip,
  reference,
  labelWidth = 104,
  rowHeight = 30,
  domainMax,
}: {
  data: T[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  tooltip: (d: T) => TipModel;
  reference?: { value: number; label: string };
  labelWidth?: number;
  rowHeight?: number;
  domainMax?: number;
}) {
  const Tip = tip<T>(tooltip);
  const height = Math.max(120, data.length * rowHeight + 32);
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ top: reference ? 16 : 4, right: 44, bottom: 0, left: 0 }} barCategoryGap="28%" accessibilityLayer>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tickFormatter={(v: number) => axisFormat(v)}
          domain={[0, domainMax ?? "auto"]}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={labelWidth}
          tick={{ fontSize: 12 }}
          interval={0}
        />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={Tip} />
        {reference && (
          <ReferenceLine
            x={reference.value}
            stroke="var(--chart-3)"
            strokeDasharray="4 4"
            label={{ value: reference.label, position: "top", fontSize: 11, fill: "var(--chart-axis)" }}
          />
        )}
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.highlight ? "var(--chart-1)" : "var(--chart-2)"} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            offset={8}
            className="num fill-foreground"
            fontSize={12}
            formatter={(v: unknown) => (typeof v === "number" ? format(v) : "")}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
