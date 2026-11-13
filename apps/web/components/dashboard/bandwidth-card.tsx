import { TrafficIcon } from "@/components/icons/traffic-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { getNetworkUsage } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/** Everything the connection carried in the last 24 hours. */
export async function BandwidthCard() {
  const { data, error } = await load(getNetworkUsage);
  const title = "Bandwidth · 24 h";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={TrafficIcon}>
        <CardUnavailable message={error} />
      </Card>
    );
  }

  return (
    <Card title={title} Icon={TrafficIcon}>
      <div className="flex flex-1 flex-col justify-end">
        <p className="text-4xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
          {formatBytes(data.total_rx_bytes + data.total_tx_bytes)}
        </p>
        <p className="mt-1 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
          ↓ {formatBytes(data.total_rx_bytes)} · ↑ {formatBytes(data.total_tx_bytes)}
        </p>
      </div>
    </Card>
  );
}
