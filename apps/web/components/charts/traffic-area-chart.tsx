"use client";

import { useReducedMotion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { AXIS, COLORS } from "@/components/charts/chart-theme";
import { formatBitsPerSecond, formatSince } from "@/lib/format";
import { TIME_ZONE } from "@/lib/time-zone";

export type TrafficChartPoint = { at: number; rx: number | null; tx: number | null };

const DAY = 24 * 3_600_000;
const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, weekday: "short" });

function bits(bytesPerSecond: number): string {
  const { value, unit } = formatBitsPerSecond(bytesPerSecond);
  return `${value} ${unit}`;
}

/** The download and upload speed of the server over the week, as two filled curves. */
export function TrafficAreaChart({ points }: { points: TrafficChartPoint[] }) {
  const animate = !useReducedMotion();
  const start = points[0].at;
  const end = points.at(-1)!.at;
  const ticks: number[] = [];
  for (let tick = Math.ceil(start / DAY) * DAY; tick <= end; tick += DAY) ticks.push(tick);

  return (
    <div className="h-full min-h-48 text-muted">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 4 }}>
          <defs>
            {[
              ["rx-fill", COLORS.sky],
              ["tx-fill", COLORS.violet],
            ].map(([id, color]) => (
              <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <XAxis
            {...AXIS}
            dataKey="at"
            type="number"
            scale="time"
            domain={[start, end]}
            ticks={ticks}
            tickFormatter={(value: number) => dayFormat.format(value)}
            minTickGap={24}
          />
          <YAxis {...AXIS} width={64} tickFormatter={bits} domain={[0, (max: number) => Math.max(max * 1.1, 1)]} />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  label={formatSince(label as number)}
                  rows={payload.map((item) => ({
                    color: item.dataKey === "rx" ? COLORS.sky : COLORS.violet,
                    name: item.dataKey === "rx" ? "Download" : "Upload",
                    value: item.value == null ? "—" : bits(Number(item.value)),
                  }))}
                />
              ) : null
            }
          />
          {(["tx", "rx"] as const).map((key) => (
            <Area
              key={key}
              dataKey={key}
              type="monotone"
              stroke={key === "rx" ? COLORS.sky : COLORS.violet}
              strokeWidth={key === "rx" ? 2 : 1.5}
              fill={`url(#${key}-fill)`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: key === "rx" ? COLORS.sky : COLORS.violet }}
              connectNulls
              isAnimationActive={animate}
              animationDuration={1400}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
