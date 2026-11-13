"use client";

import { useReducedMotion } from "motion/react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { AXIS, COLORS } from "@/components/charts/chart-theme";
import { formatBytes, formatHour } from "@/lib/format";

export type BandwidthHour = { start: number; rx_bytes: number; tx_bytes: number };

/** The traffic of each hour as a bar: download at the bottom, upload stacked on top. */
export function BandwidthBars({ hours }: { hours: BandwidthHour[] }) {
  const animate = !useReducedMotion();
  return (
    <div className="h-full min-h-32 text-muted">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={hours} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="18%">
          <defs>
            <linearGradient id="rx-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.sky} />
              <stop offset="100%" stopColor={COLORS.sky} stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id="tx-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.violet} />
              <stop offset="100%" stopColor={COLORS.violet} stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <XAxis {...AXIS} dataKey="start" tickFormatter={formatHour} interval={5} />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06, radius: 6 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  label={formatHour(label as number)}
                  rows={payload.map((item) => ({
                    color: item.dataKey === "rx_bytes" ? COLORS.sky : COLORS.violet,
                    name: item.dataKey === "rx_bytes" ? "Download" : "Upload",
                    value: formatBytes(Number(item.value)),
                  }))}
                />
              ) : null
            }
          />
          <Bar dataKey="rx_bytes" stackId="traffic" fill="url(#rx-fill)" isAnimationActive={animate} animationDuration={1100} />
          <Bar
            dataKey="tx_bytes"
            stackId="traffic"
            fill="url(#tx-fill)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={animate}
            animationDuration={1100}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
