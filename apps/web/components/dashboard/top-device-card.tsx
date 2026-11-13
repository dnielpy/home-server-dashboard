import { LaptopIcon } from "@/components/icons/laptop-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { getNetworkUsage } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/** The device that used the most bandwidth in the last 24 hours. */
export async function TopDeviceCard() {
  const { data, error } = await load(getNetworkUsage);
  const title = "Top device · 24 h";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={LaptopIcon}>
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const device = data.top_device;
  if (!device) {
    return (
      <Card title={title} Icon={LaptopIcon}>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No device used the connection in the last 24 hours.</p>
      </Card>
    );
  }

  const used = device.down_bytes + device.up_bytes;
  const total = data.total_rx_bytes + data.total_tx_bytes;
  // Device usage is estimated from the router's live rates, so it can come out above the Nano's total
  const share = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : null;

  return (
    <Card
      title={title}
      Icon={LaptopIcon}
      footer={share === null ? undefined : `About ${share}% of all the traffic`}
    >
      <div className="flex flex-1 flex-col justify-end gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-2xl font-semibold xl:text-3xl text-zinc-900 dark:text-zinc-50">{device.name}</p>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{device.mac}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold xl:text-3xl text-zinc-900 tabular-nums dark:text-zinc-50">{formatBytes(used)}</p>
            <p className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              ↓ {formatBytes(device.down_bytes)} · ↑ {formatBytes(device.up_bytes)}
            </p>
          </div>
        </div>
        {share !== null && (
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${share}%` }} />
          </div>
        )}
      </div>
    </Card>
  );
}
