"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// Misma anatomía que SignupsChart (una serie, hue primario, grid recesivo);
// buckets diarios (YYYY-MM-DD) para ≤90 días y mensuales (YYYY-MM) para más.

const chartConfig = {
  ingresos: {
    label: "Ingresos",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function bucketLabel(bucket: string, long = false) {
  if (bucket.length === 7) {
    return new Intl.DateTimeFormat("es-ES", {
      month: "short",
      year: long ? "numeric" : "2-digit",
    }).format(new Date(`${bucket}-01T00:00:00`));
  }
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    ...(long ? { year: "numeric" } : {}),
  }).format(new Date(`${bucket}T00:00:00`));
}

export function RevenueChart({
  data,
}: {
  data: { date: string; ingresos: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: string) => bucketLabel(value)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => euro.format(value)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value) => euro.format(Number(value))}
              labelFormatter={(_, payload) => {
                const bucket = payload?.[0]?.payload?.date as
                  | string
                  | undefined;
                return bucket ? bucketLabel(bucket, true) : "";
              }}
            />
          }
        />
        <Bar
          dataKey="ingresos"
          fill="var(--color-ingresos)"
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ChartContainer>
  );
}
