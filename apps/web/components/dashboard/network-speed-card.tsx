"use client";

import { useEffect, useState } from "react";

import { Badge, Card, CardUnavailable } from "@/components/dashboard/card";
import { GaugeIcon } from "@/components/icons/gauge-icon";
import type { NetworkSpeed } from "@/lib/api";
import { formatBitsPerSecond } from "@/lib/format";

const REFRESH_INTERVAL_MS = 5_000;

/** The Nano's download speed right now, read every 5 seconds. */
export function NetworkSpeedCard() {
  const [speed, setSpeed] = useState<NetworkSpeed | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Each read takes about a second, so the next one is scheduled after it ends instead of on a fixed interval
    async function poll() {
      try {
        const response = await fetch("/api/network-speed", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Network speed responded with ${response.status}`);
        setSpeed(await response.json());
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

  const badge = speed && !error ? <Badge tone="green">Live</Badge> : undefined;
  const download = speed ? formatBitsPerSecond(speed.rx_bytes_per_second) : null;
  const upload = speed ? formatBitsPerSecond(speed.tx_bytes_per_second) : null;

  return (
    <Card title="Nano download" Icon={GaugeIcon} badge={badge}>
      {error && !speed ? (
        <CardUnavailable message="The Nano could not be read." />
      ) : (
        <div aria-live="polite" className="flex flex-1 flex-col justify-end">
          <p className="text-4xl font-semibold xl:text-5xl text-zinc-900 tabular-nums dark:text-zinc-50">
            {download ? download.value : "…"}
            {download && <span className="ml-1 text-base font-medium text-zinc-500 xl:text-xl">{download.unit}</span>}
          </p>
          <p className="mt-1 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
            {upload ? `↑ ${upload.value} ${upload.unit} upload` : "Measuring…"}
          </p>
        </div>
      )}
    </Card>
  );
}
