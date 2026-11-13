"use client";

import { useReducedMotion } from "motion/react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { AXIS, COLORS } from "@/components/charts/chart-theme";
import { formatHour } from "@/lib/format";

export type BatteryChartPoint = { at: number; soc: number | null; load_w: number | null };
export type Blackout = { start: number; end: number };

const SIX_HOURS = 6 * 3_600_000;

/** The battery percentage over the day as a filled curve, the load as a thin line on its own scale, and the
 * blackouts as red bands behind them. */
export function BatteryAreaChart({ points, blackouts }: { points: BatteryChartPoint[]; blackouts: Blackout[] }) {
  const animate = !useReducedMotion();
  const start = points[0].at;
  const end = points.at(-1)!.at;
  const ticks: number[] = [];
  for (let tick = Math.ceil(start / SIX_HOURS) * SIX_HOURS; tick <= end; tick += SIX_HOURS) ticks.push(tick);
  const maxLoad = Math.max(100, ...points.map((point) => point.load_w ?? 0));

  return (
    <div className="h-full min-h-48 text-muted">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="soc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.45} />
              <stop offset="100%" stopColor={COLORS.emerald} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="soc-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLORS.sky} />
              <stop offset="100%" stopColor={COLORS.emerald} />
            </linearGradient>
          </defs>
          {blackouts.map((blackout) => (
            <ReferenceArea
              key={blackout.start}
              yAxisId="soc"
              x1={Math.max(blackout.start, start)}
              x2={Math.min(blackout.end, end)}
              fill={COLORS.red}
              fillOpacity={0.1}
              strokeOpacity={0}
            />
          ))}
          <XAxis
            {...AXIS}
            dataKey="at"
            type="number"
            scale="time"
            domain={[start, end]}
            ticks={ticks}
            tickFormatter={formatHour}
            minTickGap={24}
          />
          <YAxis {...AXIS} yAxisId="soc" domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} />
          <YAxis {...AXIS} yAxisId="load" orientation="right" domain={[0, Math.ceil(maxLoad * 1.2)]} hide />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  label={formatHour(label as number)}
                  rows={payload.map((item) => ({
                    color: item.dataKey === "soc" ? COLORS.emerald : COLORS.amber,
                    name: item.dataKey === "soc" ? "Battery" : "Load",
                    value: item.value == null ? "—" : item.dataKey === "soc" ? `${item.value}%` : `${Math.round(Number(item.value))} W`,
                  }))}
                />
              ) : null
            }
          />
          <Line
            yAxisId="load"
            dataKey="load_w"
            type="monotone"
            stroke={COLORS.amber}
            strokeOpacity={0.7}
            strokeWidth={1.25}
            dot={false}
            connectNulls
            isAnimationActive={animate}
            animationDuration={1400}
          />
          <Area
            yAxisId="soc"
            dataKey="soc"
            type="monotone"
            stroke="url(#soc-stroke)"
            strokeWidth={2.5}
            fill="url(#soc-fill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: COLORS.emerald }}
            connectNulls
            isAnimationActive={animate}
            animationDuration={1400}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
