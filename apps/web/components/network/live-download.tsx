"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Badge } from "@/components/dashboard/card";
import { DownloadIcon } from "@/components/icons/download-icon";
import { Panel } from "@/components/ui/panel";
import { formatBitsPerSecond } from "@/lib/format";
import type { ThroughputEvent } from "@/lib/homenet-api";
import { SERIES_COLORS } from "@/lib/network/chart-colors";
import { readNdjson } from "@/lib/network/ndjson";

// One sample a second, so the line covers the last minute
const HISTORY_SAMPLES = 60;
const RECONNECT_MS = 3_000;
// At least 1 Mbps tall, so an idle link stays a flat line at the bottom
const MIN_TOP = 125_000;

type StreamState = "connecting" | "live" | "error";

function formatShort(bytesPerSecond: number): string {
  const { value, unit } = formatBitsPerSecond(bytesPerSecond);
  return `${value} ${unit}`;
}

/** The download speed the Nano is carrying right now, read every second, with a line of the last minute. */
export function LiveDownload() {
  const [samples, setSamples] = useState<number[]>([]);
  const [state, setState] = useState<StreamState>("connecting");

  useEffect(() => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function listen() {
      const response = await fetch("/api/network/throughput", { signal: controller.signal, cache: "no-store" });
      if (!response.ok || !response.body) throw new Error(`Throughput responded with ${response.status}`);
      await readNdjson<ThroughputEvent>(response, (event) => {
        if (event.type === "rate") {
          setState("live");
          setSamples((current) => [...current, event.rx_bytes_per_second].slice(-HISTORY_SAMPLES));
        } else {
          setState("error");
        }
      });
      throw new Error("The throughput stream ended");
    }

    function connect() {
      listen().catch(() => {
        if (controller.signal.aborted) return;
        setState("error");
        retry = setTimeout(connect, RECONNECT_MS);
      });
    }

    connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, []);

  const current = samples.at(-1);
  const peak = samples.length > 0 ? Math.max(...samples) : null;
  const speed = current !== undefined ? formatBitsPerSecond(current) : null;
  // The newest sample sits on the right edge, so the line fills in from the right while the first minute arrives
  const rows = Array.from({ length: HISTORY_SAMPLES }, (_, index) => {
    const sample = samples[index - (HISTORY_SAMPLES - samples.length)];
    return { ago: HISTORY_SAMPLES - 1 - index, rx: sample ?? null };
  });

  return (
    <Panel
      id="live-download-title"
      title="Download now"
      subtitle="Read from the Nano every second"
      Icon={DownloadIcon}
      accent="sky"
      actions={
        state === "live" ? (
          <Badge tone="green" live>
            Live
          </Badge>
        ) : state === "error" ? (
          <Badge tone="red">Nano unreachable</Badge>
        ) : (
          <Badge tone="zinc">Connecting…</Badge>
        )
      }
    >
      <p className={`tabular-nums ${state === "error" ? "opacity-50" : ""}`}>
        <span className="text-5xl font-light tracking-tight text-foreground">{speed?.value ?? "–"}</span>
        <span className="ml-1.5 text-lg text-muted">{speed?.unit ?? "Mbps"}</span>
      </p>

      <div className="mt-4 h-24 text-muted">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="live-download-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_COLORS.download} stopOpacity={0.45} />
                <stop offset="100%" stopColor={SERIES_COLORS.download} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, (max: number) => Math.max(max, MIN_TOP)]} />
            <Tooltip
              cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !row || row.rx === null) return null;
                return (
                  <ChartTooltip
                    label={row.ago === 0 ? "Now" : `${row.ago} s ago`}
                    rows={[{ color: SERIES_COLORS.download, name: "Download", value: formatShort(row.rx) }]}
                  />
                );
              }}
            />
            <Area
              dataKey="rx"
              type="monotone"
              stroke={SERIES_COLORS.download}
              strokeWidth={2}
              fill="url(#live-download-fill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 flex justify-between text-xs text-muted tabular-nums">
        <span>Last minute</span>
        <span>{peak !== null ? `Peak ${formatShort(peak)}` : "Waiting for the first reading"}</span>
      </p>
    </Panel>
  );
}
