import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { BandwidthChart } from "@/components/network/bandwidth-chart";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { RangeFilter } from "@/components/ui/range-filter";
import { getDeviceHistory } from "@/lib/homenet-api";
import { BUCKET_LABELS, bucketFor } from "@/lib/network/bandwidth-bucket";
import { buildBars } from "@/lib/network/bandwidth-series";
import { formatBytes } from "@/lib/network/bytes-format";
import { parseTimeRange, TIME_RANGES } from "@/lib/network/time-ranges";

type SearchParams = Record<string, string | string[] | undefined>;

const HOUR_MS = 3_600_000;

type DeviceHistoryStatsProps = { mac: string; searchParams: SearchParams };

/** The device's estimated usage over time, with its own range filter. */
export async function DeviceHistoryStats({ mac, searchParams }: DeviceHistoryStatsProps) {
  const range = parseTimeRange(searchParams.usageHours, TIME_RANGES);
  const bucket = bucketFor(range.hours);
  const { data, error } = await load(() => getDeviceHistory(mac, range.hours, bucket));

  const filter = (
    <RangeFilter
      label="Data used time range"
      param="usageHours"
      ranges={TIME_RANGES}
      selected={range}
      searchParams={searchParams}
      path={`/network/devices/${encodeURIComponent(mac)}`}
    />
  );

  if (error !== undefined) {
    return (
      <Panel id="usage-chart-title" title="Data used (estimated)" Icon={TrafficIcon} accent="sky" actions={filter}>
        <CardUnavailable message={error} />
      </Panel>
    );
  }

  const { history, fetchedAt: to } = data;
  const from = to - range.hours * HOUR_MS;
  // The chart reads rx/tx: bytes downloaded and uploaded
  const points = history.items.map((item) => ({ start: item.start, rx_bytes: item.down_bytes, tx_bytes: item.up_bytes }));
  const bars = buildBars(points, bucket, from, to);
  const subtitle = `${range.description} · ${formatBytes(history.total_down_bytes)} down · ${formatBytes(history.total_up_bytes)} up · per ${BUCKET_LABELS[bucket]}`;

  return (
    <Panel
      id="usage-chart-title"
      title="Data used (estimated)"
      subtitle={subtitle}
      Icon={TrafficIcon}
      accent="sky"
      actions={filter}
    >
      {history.items.length === 0 ? (
        <PanelEmpty height={128}>No samples of this device in this period.</PanelEmpty>
      ) : (
        <BandwidthChart bars={bars} bucket={bucket} to={to} ariaLabel="Data downloaded and uploaded over time." />
      )}
    </Panel>
  );
}
