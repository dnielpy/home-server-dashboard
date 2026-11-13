import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { BatteryLevelChart, TrendLegend } from "@/components/energy/battery-level-chart";
import { BatteryIcon } from "@/components/icons/battery-icon";
import { DataTable } from "@/components/ui/data-table";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { RangeFilter } from "@/components/ui/range-filter";
import { getBatteryStatus } from "@/lib/bluetti-api";
import { averageRows } from "@/lib/energy/average-rows";
import { parseTimeRange, TIME_RANGES } from "@/lib/energy/time-ranges";
import { buildTimeSeries, fillGaps } from "@/lib/energy/time-series";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function BatteryStats({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const range = parseTimeRange(params.hours, TIME_RANGES);
  const { data, error } = await load(() => getBatteryStatus(range.hours));

  const filter = (
    <RangeFilter
      label="Battery level time range"
      param="hours"
      ranges={TIME_RANGES}
      selected={range}
      searchParams={params}
      path="/energy/battery"
    />
  );

  if (error !== undefined) {
    return (
      <Panel id="battery-chart-title" title="Battery level" Icon={BatteryIcon} accent="emerald" actions={filter}>
        <CardUnavailable message={error} />
      </Panel>
    );
  }

  const { readings, fetchedAt } = data;
  const samples = fillGaps(readings.map((reading) => ({ date: reading.date, value: reading.battery_percent })));

  return (
    <Panel
      id="battery-chart-title"
      title="Battery level"
      subtitle={`${range.description} · ${readings.length.toLocaleString("en-US")} readings`}
      Icon={BatteryIcon}
      accent="emerald"
      actions={filter}
    >
      {readings.length === 0 ? (
        <PanelEmpty height={420}>No readings in this period.</PanelEmpty>
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <TrendLegend />
          </div>
          <BatteryLevelChart series={buildTimeSeries(samples, range.hours, fetchedAt)} />
          <DataTable {...averageRows(samples, range.hours, fetchedAt, "Average battery", "%")} />
        </>
      )}
    </Panel>
  );
}
