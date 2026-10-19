"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, LabelList, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatMonth } from "@/lib/months";
import { tip, type TipRow } from "./tooltip";

export interface TrendPoint {
  label: string;
  value: number | null;
  /** Optional comparison series drawn as a dashed neutral line. */
  compare?: number | null;
  tooltipRows?: TipRow[];
}

const config = {
  value: { label: "Value", color: "var(--chart-1)" },
  compare: { label: "Comparison", color: "var(--chart-3)" },
} satisfies ChartConfig;

/**
 * Single-measure trend over time. Area for stock measures (headcount),
 * plain line for rates. The last point carries a direct label.
 */
export function TrendChart({
  data,
  format,
  axisFormat = format,
  variant = "area",
  height = 240,
  title,
  domain,
  reference,
  compareLabel,
}: {
  data: TrendPoint[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  variant?: "area" | "line";
  height?: number;
  title: string;
  domain?: [number | "auto" | "dataMin" | ((v: number) => number), number | "auto" | "dataMax" | ((v: number) => number)];
  reference?: { value: number; label: string };
  compareLabel?: string;
}) {
  const gradientId = `trend-${useId().replace(/:/g, "")}`;
  const lastIndex = data.length - 1;
  const Tip = tip<TrendPoint>((d) => ({
    title: d.label,
    rows: d.tooltipRows ?? [
      { label: title, value: d.value === null ? "—" : format(d.value), color: "var(--chart-1)" },
      ...(compareLabel && d.compare !== undefined
        ? [{ label: compareLabel, value: d.compare === null ? "—" : format(d.compare), color: "var(--chart-3)" }]
        : []),
    ],
  }));

  const lastLabel = (props: { index?: number; x?: number | string; y?: number | string; value?: unknown }) => {
    if (props.index !== lastIndex || typeof props.value !== "number") return null;
    return (
      <text x={Number(props.x)} y={Number(props.y) - 10} textAnchor="end" className="num fill-foreground text-xs font-medium">
        {format(props.value)}
      </text>
    );
  };

  const common = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={16}
        interval="preserveStartEnd"
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={48}
        tickMargin={4}
        tickFormatter={(v: number) => axisFormat(v)}
        domain={domain ?? ["auto", "auto"]}
        allowDecimals={false}
      />
      <ChartTooltip cursor={{ stroke: "var(--border)" }} content={Tip} />
      {reference && (
        <ReferenceLine
          y={reference.value}
          stroke="var(--chart-3)"
          strokeDasharray="4 4"
          label={{ value: reference.label, position: "insideTopLeft", fontSize: 11, fill: "var(--chart-axis)" }}
        />
      )}
    </>
  );

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      {variant === "area" ? (
        <AreaChart data={data} margin={{ top: 20, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {common}
          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            isAnimationActive={false}
          >
            <LabelList dataKey="value" content={lastLabel} />
          </Area>
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 20, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
          {common}
          {compareLabel && (
            <Line
              dataKey="compare"
              type="monotone"
              stroke="var(--color-compare)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            isAnimationActive={false}
            connectNulls
          >
            <LabelList dataKey="value" content={lastLabel} />
          </Line>
        </LineChart>
      )}
    </ChartContainer>
  );
}

export function monthLabel(month: string) {
  return formatMonth(month, "MMM yy");
}
