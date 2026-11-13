"use client";

import { useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { COLORS } from "@/components/charts/chart-theme";

/** The share of the day with grid power as a ring, with that share in its middle. `className` sizes it. */
export function PowerDonut({
  withPower,
  withoutPower,
  className = "h-full max-h-40 min-h-28",
}: {
  withPower: number;
  withoutPower: number;
  className?: string;
}) {
  const animate = !useReducedMotion();
  const total = withPower + withoutPower;
  const percent = total > 0 ? Math.round((withPower / total) * 100) : 0;
  const data = [
    { name: "With power", value: withPower, color: COLORS.emerald },
    { name: "Blackout", value: withoutPower, color: COLORS.red },
  ];

  return (
    <div className={`relative aspect-square ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="74%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={withoutPower > 0 && withPower > 0 ? 3 : 0}
            cornerRadius={6}
            stroke="none"
            isAnimationActive={animate}
            animationDuration={1300}
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-foreground tabular-nums">{percent}%</span>
        <span className="text-[11px] text-muted">with power</span>
      </div>
    </div>
  );
}
