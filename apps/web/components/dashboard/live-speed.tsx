"use client";

import { useEffect, useState } from "react";

import { LiveSparkline } from "@/components/charts/live-sparkline";
import { Badge, Card, CardUnavailable } from "@/components/dashboard/card";
import { GaugeIcon } from "@/components/icons/gauge-icon";
import { AnimatedNumber } from "@/components/ui/animated-number";
import type { NetworkSpeed, SpeedTest } from "@/lib/api";
import { formatBitsPerSecond, formatClock } from "@/lib/format";

const REFRESH_INTERVAL_MS = 5_000;
// Five minutes of readings
const HISTORY_LENGTH = 60;

/** The Nano's download speed right now, read every 5 seconds, with the last few minutes as a curve. */
export function LiveSpeed({ speedTest }: { speedTest: SpeedTest | null }) {
  const [speed, setSpeed] = useState<NetworkSpeed | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Each read takes about a second, so the next one is scheduled after it ends instead of on a fixed interval
    async function poll() {
      try {
        const response = await fetch("/api/network-speed", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Network speed responded with ${response.status}`);
        const next: NetworkSpeed = await response.json();
        setSpeed(next);
        setHistory((previous) => [...previous, next.rx_bytes_per_second].slice(-HISTORY_LENGTH));
        setError(false);
      } catch {
        if (controller.signal.aborted) return;
        setError(true);
      }
      timer = setTimeout(poll, REFRESH_INTERVAL_MS);
    }

    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const badge =
    speed && !error ? (
      <Badge tone="green" live>
        Live
      </Badge>
    ) : undefined;
  const download = speed ? formatBitsPerSecond(speed.rx_bytes_per_second) : null;
  const upload = speed ? formatBitsPerSecond(speed.tx_bytes_per_second) : null;
  const footer = speedTest ? (
    <span className="flex justify-between gap-3 tabular-nums">
      <span>
        Speed test <span className="font-medium text-foreground">{speedTest.download_mbps.toFixed(1)} Mbps</span>
        {speedTest.ping_ms !== null && ` · ${Math.round(speedTest.ping_ms)} ms`}
      </span>
      <span>{formatClock(speedTest.measured_at)}</span>
    </span>
  ) : undefined;

  return (
    <Card title="Nano download" Icon={GaugeIcon} accent="sky" badge={badge} footer={footer}>
      {error && !speed ? (
        <CardUnavailable message="The Nano could not be read." />
      ) : (
        <div aria-live="polite" className="flex flex-1 flex-col justify-between gap-3">
          <div className="-mx-1 min-h-14 flex-1">{history.length > 1 && <LiveSparkline values={history} />}</div>
          <div>
            <p className="text-4xl font-semibold tracking-tight text-foreground xl:text-5xl">
              {download ? <AnimatedNumber value={Number(download.value)} digits={download.value.includes(".") ? 1 : 0} /> : "…"}
              {download && <span className="ml-1.5 text-base font-medium text-muted xl:text-xl">{download.unit}</span>}
            </p>
            <p className="mt-1 text-sm text-muted tabular-nums">
              {upload ? `↑ ${upload.value} ${upload.unit} upload` : "Measuring…"}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
