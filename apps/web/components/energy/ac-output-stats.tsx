import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { AcOutputChart } from "@/components/energy/ac-output-chart";
import { AcOutletIcon } from "@/components/icons/ac-outlet-icon";
import { DataTable } from "@/components/ui/data-table";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { RangeFilter } from "@/components/ui/range-filter";
import { getAcOutputHistory } from "@/lib/bluetti-api";
import { averageRows } from "@/lib/energy/average-rows";
import { energyWh, formatEnergy } from "@/lib/energy/power-stats";
import { parseTimeRange, TIME_RANGES } from "@/lib/energy/time-ranges";
import { buildTimeSeries, fillGaps } from "@/lib/energy/time-series";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function AcOutputStats({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const range = parseTimeRange(params.acHours, TIME_RANGES);
  const { data, error } = await load(() => getAcOutputHistory(range.hours));

  const filter = (
    <RangeFilter
      label="AC output time range"
      param="acHours"
      ranges={TIME_RANGES}
      selected={range}
      searchParams={params}
      path="/energy/battery"
    />
  );

  if (error !== undefined) {
    return (
      <Panel id="ac-output-chart-title" title="AC output power" Icon={AcOutletIcon} accent="amber" actions={filter}>
        <CardUnavailable message={error} />
      </Panel>
    );
  }

  const { readings, fetchedAt } = data;
  const samples = fillGaps(readings.map((reading) => ({ date: reading.date, value: reading.ac_output })));
  const peak = Math.max(0, ...readings.map((reading) => reading.ac_output));
  const subtitle = readings.length
    ? `${range.description} · ${formatEnergy(energyWh(samples))} used · peak ${peak} W`
    : range.description;

  return (
    <Panel
      id="ac-output-chart-title"
      title="AC output power"
      subtitle={subtitle}
      Icon={AcOutletIcon}
      accent="amber"
      actions={filter}
    >
      {readings.length === 0 ? (
        <PanelEmpty height={320}>No readings in this period.</PanelEmpty>
      ) : (
        <>
          <AcOutputChart series={buildTimeSeries(samples, range.hours, fetchedAt)} />
          <DataTable {...averageRows(samples, range.hours, fetchedAt, "Average power", " W")} />
        </>
      )}
    </Panel>
  );
}
