"use client";

import { useId } from "react";
import { Area, AreaChart, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const config = { value: { label: "Value", color: "var(--chart-1)" } } satisfies ChartConfig;

export function Sparkline({ data, label }: { data: (number | null)[]; label: string }) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  const points = data.map((value, i) => ({ i, value }));
  const valid = data.filter((v): v is number => v !== null);
  if (valid.length < 2) return <div className="h-8" aria-hidden />;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.05 || 1;
  return (
    <div className="h-8 w-full" role="img" aria-label={label}>
      <ChartContainer config={config} className="aspect-auto h-8 w-full" initialDimension={{ width: 160, height: 32 }}>
        <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - pad, max + pad]} />
          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            connectNulls
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
