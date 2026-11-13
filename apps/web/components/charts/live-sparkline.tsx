"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

import { COLORS } from "@/components/charts/chart-theme";

/** The last readings of the live speed as a small filled curve that moves left as new ones arrive. */
export function LiveSparkline({ values }: { values: number[] }) {
  const data = values.map((value, index) => ({ index, value }));
  return (
    <div className="h-full min-h-14">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="speed-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.sky} stopOpacity={0.5} />
              <stop offset="100%" stopColor={COLORS.sky} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, (max: number) => Math.max(max * 1.15, 1)]} />
          <Area
            dataKey="value"
            type="monotone"
            stroke={COLORS.sky}
            strokeWidth={2}
            fill="url(#speed-fill)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
