"use client";

import { Card, CardSkeleton, CardUnavailable } from "@/components/dashboard/card";
import { useSystem } from "@/components/dashboard/system-live";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { formatBitsPerSecond, formatBytes } from "@/lib/format";

function Speed({ label, color, bytesPerSecond }: { label: string; color: string; bytesPerSecond: number | null }) {
  const speed = bytesPerSecond === null ? null : formatBitsPerSecond(bytesPerSecond);
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <span aria-hidden className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground xl:text-4xl">
        {speed ? <AnimatedNumber value={Number(speed.value)} digits={speed.value.includes(".") ? 1 : 0} /> : "—"}
        {speed && <span className="ml-1.5 text-base font-medium text-muted">{speed.unit}</span>}
      </p>
    </div>
  );
}

/** The traffic of the server's network interface in the last second, and all it has carried since the agent started counting. */
export function ServerTrafficCard() {
  const { data, error } = useSystem();
  if (!data) {
    if (!error) return <CardSkeleton />;
    return (
      <Card title="Server network" Icon={TrafficIcon} accent="sky">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const { network } = data;
  return (
    <Card
      title={network.interface ? `Server network · ${network.interface}` : "Server network"}
      Icon={TrafficIcon}
      accent="sky"
      footer={
        <span className="flex flex-wrap justify-between gap-3 tabular-nums">
          <span>Total carried</span>
          <span>
            ↓ <span className="font-medium text-foreground">{formatBytes(network.total_rx_bytes)}</span> · ↑{" "}
            <span className="font-medium text-foreground">{formatBytes(network.total_tx_bytes)}</span>
          </span>
        </span>
      }
    >
      <div className="grid flex-1 grid-cols-2 items-end gap-4">
        <Speed label="Download" color="bg-sky-500" bytesPerSecond={network.rx_bytes_per_second} />
        <Speed label="Upload" color="bg-violet-500" bytesPerSecond={network.tx_bytes_per_second} />
      </div>
    </Card>
  );
}
