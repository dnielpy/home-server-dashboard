import { BandwidthBars } from "@/components/charts/bandwidth-bars";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { getNetworkUsage } from "@/lib/api";
import { formatBytes, splitBytes } from "@/lib/format";

/** Everything the connection carried in the last 24 hours, hour by hour. */
export async function BandwidthCard() {
  const { data, error } = await load(getNetworkUsage);
  const title = "Bandwidth · 24 h";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={TrafficIcon} accent="violet">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const total = splitBytes(data.total_rx_bytes + data.total_tx_bytes);
  // An API deployed before the hourly breakdown leaves it out; the total still shows, without the bars
  const hours = (data.hourly ?? []).map((hour) => ({ ...hour, start: Date.parse(hour.start) }));
  return (
    <Card title={title} Icon={TrafficIcon} accent="violet">
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-4xl font-semibold tracking-tight text-foreground xl:text-5xl">
            <AnimatedNumber value={total.value} digits={total.digits} />
            <span className="ml-1.5 text-base font-medium text-muted xl:text-xl">{total.unit}</span>
          </p>
          <p className="flex gap-3 pb-1 text-sm text-muted tabular-nums">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-sky-500" />↓ {formatBytes(data.total_rx_bytes)}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-violet-500" />↑ {formatBytes(data.total_tx_bytes)}
            </span>
          </p>
        </div>
        <div className="min-h-32 flex-1">{hours.length > 0 && <BandwidthBars hours={hours} />}</div>
      </div>
    </Card>
  );
}
