"use client";

import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { AXIS } from "@/components/charts/chart-theme";
import { ChartLegend } from "@/components/network/chart-legend";
import type { BandwidthBucket } from "@/lib/homenet-api";
import { type BandwidthBar, formatBucket } from "@/lib/network/bandwidth-series";
import { byteTicks, formatBytes } from "@/lib/network/bytes-format";
import { SERIES_COLORS } from "@/lib/network/chart-colors";
import { formatTimeTick, timeTicks } from "@/lib/network/chart-time";
import { formatBytesPerSecond } from "@/lib/network/speed-format";

const HEIGHT = 280;
const TICK_WIDTH = 900;

const SERIES = [
  { key: "rx", label: "Download", color: SERIES_COLORS.download },
  { key: "tx", label: "Upload", color: SERIES_COLORS.upload },
] as const;

type BandwidthChartProps = {
  bars: BandwidthBar[];
  bucket: BandwidthBucket;
  to: number;
  /** Bytes, or bytes per second for speeds. A name and not a function, so server components can pass it. */
  valueFormat?: "bytes" | "speed";
  ariaLabel?: string;
};

const VALUE_FORMATTERS = { bytes: formatBytes, speed: formatBytesPerSecond };

type Row = { t: number; start: number; rx: number | null; tx: number | null };

/** Download and upload per bucket as two filled curves; buckets without traffic samples are holes, not zeros. */
export function BandwidthChart({
  bars,
  bucket,
  to,
  valueFormat = "bytes",
  ariaLabel = "Bytes downloaded and uploaded over time.",
}: BandwidthChartProps) {
  const animate = !useReducedMotion();
  const formatValue = VALUE_FORMATTERS[valueFormat];
  const from = bars[0].start;
  const rangeMs = to - from;
  const rows = useMemo(
    () =>
      bars.map(
        (bar): Row => ({
          t: (bar.start + Math.min(bar.end, to)) / 2,
          start: bar.start,
          rx: bar.hasData ? bar.rx : null,
          tx: bar.hasData ? bar.tx : null,
        }),
      ),
    [bars, to],
  );
  const yTicks = useMemo(() => byteTicks(Math.max(0, ...bars.map((bar) => Math.max(bar.rx, bar.tx)))), [bars]);
  const ticks = useMemo(() => timeTicks(from, to, TICK_WIDTH), [from, to]);

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend items={SERIES.map(({ label, color }) => ({ label, color }))} />
      <div className="text-muted" style={{ height: HEIGHT }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              {SERIES.map((item) => (
                <linearGradient key={item.key} id={`bandwidth-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={item.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={item.color} stopOpacity={0} />
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
            <YAxis
              {...AXIS}
              width={64}
              domain={[0, yTicks.at(-1) || 1]}
              ticks={yTicks}
              tickFormatter={(value: number) => formatValue(value)}
            />
            <Tooltip
              cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as Row | undefined;
                if (!active || !row || row.rx === null) return null;
                return (
                  <ChartTooltip
                    label={formatBucket(row.start, bucket, true)}
                    rows={SERIES.map((item) => ({
                      color: item.color,
                      name: item.label,
                      value: formatValue(row[item.key] ?? 0),
                    }))}
                  />
                );
              }}
            />
            {SERIES.map((item) => (
              <Area
                key={item.key}
                dataKey={item.key}
                type="monotone"
                stroke={item.color}
                strokeWidth={2.25}
                fill={`url(#bandwidth-${item.key})`}
                dot={rows.length <= 12 ? { r: 2.5, strokeWidth: 0, fill: item.color } : false}
                activeDot={{ r: 4, strokeWidth: 0, fill: item.color }}
                isAnimationActive={animate}
                animationDuration={1200}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
