import { LaptopIcon } from "@/components/icons/laptop-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { Meter } from "@/components/ui/meter";
import { getNetworkUsage } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/** The device that used the most bandwidth in the last 24 hours. */
export async function TopDeviceCard() {
  const { data, error } = await load(getNetworkUsage);
  const title = "Top device · 24 h";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={LaptopIcon} accent="sky">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const device = data.top_device;
  if (!device) {
    return (
      <Card title={title} Icon={LaptopIcon} accent="sky">
        <p className="text-sm text-muted">No device used the connection in the last 24 hours.</p>
      </Card>
    );
  }

  const used = device.down_bytes + device.up_bytes;
  const total = data.total_rx_bytes + data.total_tx_bytes;
  // Device usage is estimated from the router's live rates, so it can come out above the Nano's total
  const share = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : null;

  return (
    <Card title={title} Icon={LaptopIcon} accent="sky">
      <div className="flex flex-1 flex-col justify-end gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="bg-accent-soft text-accent flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold"
          >
            {device.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-2xl font-semibold tracking-tight text-foreground">{device.name}</p>
            <p className="font-mono text-xs text-muted">{device.mac}</p>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm tabular-nums">
            <span className="text-xl font-semibold text-foreground">{formatBytes(used)}</span>
            {share !== null && <span className="text-muted">{share}% of all traffic</span>}
          </div>
          {share !== null && <Meter percent={share} className="h-2" />}
          <p className="mt-1.5 text-xs text-muted tabular-nums">
            ↓ {formatBytes(device.down_bytes)} · ↑ {formatBytes(device.up_bytes)}
          </p>
        </div>
      </div>
    </Card>
  );
}
