"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  altas: {
    label: "Altas",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

function dayLabel(iso: string, withYear = false) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(`${iso}T00:00:00`));
}

export function SignupsChart({
  data,
}: {
  data: { date: string; altas: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: string) => dayLabel(value)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={36}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const iso = payload?.[0]?.payload?.date as string | undefined;
                return iso ? dayLabel(iso, true) : "";
              }}
            />
          }
        />
        <Bar
          dataKey="altas"
          fill="var(--color-altas)"
          radius={[4, 4, 0, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ChartContainer>
  );
}
