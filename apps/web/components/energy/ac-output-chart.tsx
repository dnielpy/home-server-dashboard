"use client";

import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { AXIS, COLORS } from "@/components/charts/chart-theme";
import { formatTimeTick, formatTooltipTime, timeTicks } from "@/lib/energy/chart-time";
import { wattTicks } from "@/lib/energy/power-stats";
import type { TimeSeries } from "@/lib/energy/time-series";

const HEIGHT = 320;
const TICK_WIDTH = 900;

type Row = { t: number; watts: number | null };

/** The AC output in watts over the range, as a filled amber curve with holes where there were no readings. */
export function AcOutputChart({ series }: { series: TimeSeries }) {
  const animate = !useReducedMotion();
  const { from, to, points, gapMs } = series;
  const rangeMs = to - from;
  const rows = useMemo(() => {
    const result: Row[] = [];
    points.forEach((point, index) => {
      const previous = points[index - 1];
      if (previous && point.t - previous.t > gapMs) result.push({ t: (previous.t + point.t) / 2, watts: null });
      result.push({ t: point.t, watts: point.value });
    });
    return result;
  }, [points, gapMs]);
  const yTicks = useMemo(() => wattTicks(Math.max(0, ...points.map((point) => point.value))), [points]);
  const ticks = useMemo(() => timeTicks(from, to, TICK_WIDTH), [from, to]);
  const last = points.at(-1);

  return (
    <div className="text-muted" style={{ height: HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 12, right: 48, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id="ac-output-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.amber} stopOpacity={0.4} />
              <stop offset="100%" stopColor={COLORS.amber} stopOpacity={0} />
            </linearGradient>
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
          <YAxis {...AXIS} domain={[0, yTicks.at(-1)!]} ticks={yTicks} tickFormatter={(v) => `${v} W`} />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }}
            content={({ active, payload, label }) =>
              active && payload?.length && payload[0].value != null ? (
                <ChartTooltip
                  label={formatTooltipTime(label as number)}
                  rows={[{ color: COLORS.amber, name: "AC output", value: `${Math.round(Number(payload[0].value))} W` }]}
                />
              ) : null
            }
          />
          <Area
            dataKey="watts"
            type="monotone"
            stroke={COLORS.amber}
            strokeWidth={2.25}
            fill="url(#ac-output-fill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: COLORS.amber }}
            isAnimationActive={animate}
            animationDuration={1200}
          />
          {last && (
            <ReferenceDot
              x={last.t}
              y={last.value}
              r={4.5}
              fill={COLORS.amber}
              stroke="var(--background)"
              strokeWidth={2}
              label={{
                value: `${Math.round(last.value)} W`,
                position: "right",
                fill: "var(--foreground)",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
