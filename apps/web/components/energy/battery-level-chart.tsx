"use client";

import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { AXIS, COLORS } from "@/components/charts/chart-theme";
import { pointTrends, type Trend } from "@/lib/energy/battery-series";
import { formatTimeTick, formatTooltipTime, timeTicks } from "@/lib/energy/chart-time";
import type { TimeSeries } from "@/lib/energy/time-series";

const HEIGHT = 420;
const Y_TICKS = [0, 25, 50, 75, 100];
// Recharts picks its own width; the ticks are spaced for a wide card and thinned by minTickGap on a phone
const TICK_WIDTH = 900;

export const TREND_COLORS: Record<Trend, string> = { up: COLORS.emerald, down: COLORS.red };
export const TREND_LABELS: Record<Trend, string> = { up: "Charging", down: "Discharging" };

type Row = { t: number; value: number | null; up: number | null; down: number | null; trend: Trend | null };

/** Splits the level into a charging and a discharging series; where it turns, the point belongs to both so the line
 * stays joined. A gap without readings becomes a hole. */
function buildRows(series: TimeSeries): Row[] {
  const { points, gapMs } = series;
  const trends = pointTrends(points);
  const rows: Row[] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];
    if (previous && point.t - previous.t > gapMs) {
      rows.push({ t: (previous.t + point.t) / 2, value: null, up: null, down: null, trend: null });
    }
    const joinsNext = next !== undefined && next.t - point.t <= gapMs;
    const nextTrend = joinsNext ? trends[index + 1] : null;
    const inTrend = (trend: Trend) => (trends[index] === trend || nextTrend === trend ? point.value : null);
    rows.push({ t: point.t, value: point.value, up: inTrend("up"), down: inTrend("down"), trend: trends[index] });
  });
  return rows;
}

/** The battery level over the range: green while it charges, red while it drains. */
export function BatteryLevelChart({ series }: { series: TimeSeries }) {
  const animate = !useReducedMotion();
  const { from, to } = series;
  const rangeMs = to - from;
  const rows = useMemo(() => buildRows(series), [series]);
  const ticks = useMemo(() => timeTicks(from, to, TICK_WIDTH), [from, to]);
  const last = series.points.at(-1);
  const lastTrend = rows.findLast((row) => row.trend !== null)?.trend ?? "up";

  return (
    <div className="text-muted" style={{ height: HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 12, right: 40, bottom: 0, left: -12 }}>
          <defs>
            {(["up", "down"] as const).map((trend) => (
              <linearGradient key={trend} id={`battery-level-${trend}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TREND_COLORS[trend]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={TREND_COLORS[trend]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.1} />
          <XAxis
            {...AXIS}
            dataKey="t"
            type="number"
            scale="time"
            domain={[from, to]}
            ticks={ticks}
            tickFormatter={(t: number) => formatTimeTick(t, rangeMs)}
            minTickGap={24}
          />
          <YAxis {...AXIS} domain={[0, 100]} ticks={Y_TICKS} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }}
            content={({ active, payload, label }) => {
              const row = payload?.[0]?.payload as Row | undefined;
              if (!active || !row || row.value === null || row.trend === null) return null;
              return (
                <ChartTooltip
                  label={formatTooltipTime(label as number)}
                  rows={[{ color: TREND_COLORS[row.trend], name: TREND_LABELS[row.trend], value: `${Math.round(row.value)}%` }]}
                />
              );
            }}
          />
          {(["up", "down"] as const).map((trend) => (
            <Area
              key={trend}
              dataKey={trend}
              type="monotone"
              stroke={TREND_COLORS[trend]}
              strokeWidth={2.25}
              fill={`url(#battery-level-${trend})`}
              dot={false}
              activeDot={false}
              isAnimationActive={animate}
              animationDuration={1200}
            />
          ))}
          {last && (
            <ReferenceDot
              x={last.t}
              y={last.value}
              r={4.5}
              fill={TREND_COLORS[lastTrend]}
              stroke="var(--background)"
              strokeWidth={2}
              label={{
                value: `${Math.round(last.value)}%`,
                position: "right",
                fill: "var(--foreground)",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLegend() {
  return (
    <ul aria-label="Legend" className="flex items-center gap-4 text-xs text-muted">
      {(["up", "down"] as const).map((trend) => (
        <li key={trend} className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: TREND_COLORS[trend] }} />
          {TREND_LABELS[trend]}
        </li>
      ))}
    </ul>
  );
}
