"use client";

import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { AXIS, COLORS } from "@/components/charts/chart-theme";
import { formatElapsed } from "@/lib/energy/blackout-format";
import { formatTimeTick, formatTooltipTime, timeTicks } from "@/lib/energy/chart-time";

const HEIGHT = 300;
const Y_TICKS = [0, 25, 50, 75, 100];
const MIN_RANGE_MS = 30 * 60_000;
const SAMPLES = 60;
const TICK_WIDTH = 900;

export type Projection = {
  now: number;
  soc: number;
  drainPerHour: number;
  reserve: number;
  eta: number;
  earliest: number;
  latest: number;
};

/** The level on the straight line from now to the reserve at `end`, and the reserve after it. */
function lineTo(projection: Projection, end: number, t: number): number {
  if (t >= end) return projection.reserve;
  return projection.soc - ((projection.soc - projection.reserve) * (t - projection.now)) / (end - projection.now);
}

/** Expected battery level at `t` if the current load holds. */
function levelAt(projection: Projection, t: number): number {
  const hours = (t - projection.now) / 3_600_000;
  return Math.max(projection.reserve, projection.soc - projection.drainPerHour * hours);
}

type Row = { t: number; expected: number; band: [number, number] };

/** When the battery reaches the reserve at the current load: the expected line, and around it where the level would
 * be if the drain varies as much as it did in past discharges. */
export function RuntimeChart({ projection }: { projection: Projection }) {
  const animate = !useReducedMotion();
  const { now, soc, reserve, eta, earliest, latest } = projection;
  const from = now;
  const to = now + Math.max(MIN_RANGE_MS, (latest - now) * 1.08);
  const rangeMs = to - from;

  const rows = useMemo(() => {
    const times = new Set<number>([eta, earliest, latest]);
    for (let index = 0; index <= SAMPLES; index++) times.add(from + (rangeMs * index) / SAMPLES);
    return [...times]
      .filter((t) => t >= from && t <= to)
      .sort((a, b) => a - b)
      .map((t): Row => ({
        t,
        expected: levelAt(projection, t),
        band: [lineTo(projection, earliest, t), lineTo(projection, latest, t)],
      }));
  }, [projection, from, to, rangeMs, eta, earliest, latest]);
  const ticks = useMemo(() => timeTicks(from, to, TICK_WIDTH), [from, to]);

  return (
    <div
      className="text-muted"
      style={{ height: HEIGHT }}
      role="img"
      aria-label={`Projected battery level: ${soc.toFixed(1)}% now, ${reserve}% at ${formatTooltipTime(eta)}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 24, right: 16, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="runtime-band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.red} stopOpacity={0.22} />
              <stop offset="100%" stopColor={COLORS.red} stopOpacity={0.06} />
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
          <YAxis {...AXIS} domain={[0, 100]} ticks={Y_TICKS} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }}
            content={({ active, payload, label }) => {
              const row = payload?.[0]?.payload as Row | undefined;
              return active && row ? (
                <ChartTooltip
                  label={formatTooltipTime(label as number)}
                  rows={[{ color: COLORS.red, name: "Expected", value: `${row.expected.toFixed(1)}%` }]}
                />
              ) : null;
            }}
          />
          <Area
            dataKey="band"
            type="linear"
            stroke="none"
            fill="url(#runtime-band)"
            activeDot={false}
            isAnimationActive={animate}
            animationDuration={900}
          />
          <ReferenceLine
            y={reserve}
            stroke={COLORS.amber}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            label={{ value: `${reserve}% · turn off`, position: "insideBottomLeft", fill: "currentColor", fontSize: 11 }}
          />
          <Line
            dataKey="expected"
            type="linear"
            stroke={COLORS.red}
            strokeWidth={2.25}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: COLORS.red }}
            isAnimationActive={animate}
            animationDuration={900}
          />
          <ReferenceDot
            x={now}
            y={soc}
            r={4.5}
            fill={COLORS.red}
            stroke="var(--background)"
            strokeWidth={2}
            label={{
              value: `Now · ${soc.toFixed(1)}%`,
              position: "insideTopLeft",
              dx: 8,
              fill: "var(--foreground)",
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <ReferenceDot
            x={eta}
            y={reserve}
            r={4.5}
            fill={COLORS.amber}
            stroke="var(--background)"
            strokeWidth={2}
            label={{
              value: `${formatTooltipTime(eta)} · in ${formatElapsed(eta - now)}`,
              position: "top",
              fill: "var(--foreground)",
              fontSize: 12,
              fontWeight: 600,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
