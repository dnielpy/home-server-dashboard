import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { BandwidthChart } from "@/components/network/bandwidth-chart";
import { DataTable } from "@/components/ui/data-table";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { RangeFilter } from "@/components/ui/range-filter";
import { getBandwidth } from "@/lib/homenet-api";
import { BUCKET_LABELS, bucketFor } from "@/lib/network/bandwidth-bucket";
import { buildBars } from "@/lib/network/bandwidth-series";
import { formatBytes } from "@/lib/network/bytes-format";
import { formatTooltipTime } from "@/lib/network/chart-time";
import { parseTimeRange, TIME_RANGES } from "@/lib/network/time-ranges";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const HOUR_MS = 3_600_000;

export async function BandwidthStats({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const range = parseTimeRange(params.bandwidthHours, TIME_RANGES);
  const bucket = bucketFor(range.hours);
  const { data, error } = await load(() => getBandwidth(range.hours, bucket));

  const filter = (
    <RangeFilter
      label="Bandwidth time range"
      param="bandwidthHours"
      ranges={TIME_RANGES}
      selected={range}
      searchParams={params}
      path="/network/stats"
    />
  );

  if (error !== undefined) {
    return (
      <Panel id="bandwidth-chart-title" title="Bandwidth used" Icon={TrafficIcon} accent="sky" actions={filter}>
        <CardUnavailable message={error} />
      </Panel>
    );
  }

  const { bandwidth, fetchedAt: to } = data;
  const bars = buildBars(bandwidth.items, bucket, to - range.hours * HOUR_MS, to);
  const totals = `${formatBytes(bandwidth.total_rx_bytes)} down · ${formatBytes(bandwidth.total_tx_bytes)} up`;

  return (
    <Panel
      id="bandwidth-chart-title"
      title="Bandwidth used"
      subtitle={`${range.description} · ${totals} · per ${BUCKET_LABELS[bucket]}`}
      Icon={TrafficIcon}
      accent="sky"
      actions={filter}
    >
      {bandwidth.items.length === 0 ? (
        <PanelEmpty height={128}>No traffic samples in this period.</PanelEmpty>
      ) : (
        <>
          <BandwidthChart bars={bars} bucket={bucket} to={to} />
          <DataTable
            columns={[{ label: "From" }, { label: "Download", align: "right" }, { label: "Upload", align: "right" }]}
            rows={bars
              .filter((bar) => bar.hasData)
              .map((bar) => ({
                key: bar.start,
                cells: [formatTooltipTime(bar.start), formatBytes(bar.rx), formatBytes(bar.tx)],
              }))}
          />
        </>
      )}
    </Panel>
  );
}
