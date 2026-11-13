import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { BlackoutIcon } from "@/components/icons/blackout-icon";
import { OutageChart } from "@/components/network/outage-chart";
import { DataTable } from "@/components/ui/data-table";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { RangeFilter } from "@/components/ui/range-filter";
import { getOutages } from "@/lib/homenet-api";
import { hopLabel } from "@/lib/network/hops";
import { formatDateTime, formatDuration } from "@/lib/network/outage-format";
import { parseTimeRange, TIME_RANGES } from "@/lib/network/time-ranges";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function OutageStats({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const range = parseTimeRange(params.outageHours, TIME_RANGES);
  const { data: outages, error } = await load(() => getOutages(range.hours));

  const filter = (
    <RangeFilter
      label="Outages time range"
      param="outageHours"
      ranges={TIME_RANGES}
      selected={range}
      searchParams={params}
      path="/network/stats"
    />
  );

  if (error !== undefined) {
    return (
      <Panel id="outages-chart-title" title="Outages" Icon={BlackoutIcon} accent="rose" actions={filter}>
        <CardUnavailable message={error} />
      </Panel>
    );
  }

  // Longest first; between equal ones, the most recent first
  const longestFirst = outages.toSorted(
    (a, b) => b.duration_hours - a.duration_hours || Date.parse(b.start) - Date.parse(a.start),
  );
  const totalHours = outages.reduce((sum, outage) => sum + outage.duration_hours, 0);
  const count = `${outages.length} ${outages.length === 1 ? "outage" : "outages"}`;

  return (
    <Panel
      id="outages-chart-title"
      title="Outages"
      subtitle={`${range.description} · ${count}${outages.length ? ` · ${formatDuration(totalHours)} without internet` : ""}`}
      Icon={BlackoutIcon}
      accent="rose"
      actions={filter}
    >
      {outages.length === 0 ? (
        <PanelEmpty height={128}>No outages in this period.</PanelEmpty>
      ) : (
        <>
          <OutageChart outages={longestFirst} />
          <DataTable
            columns={[{ label: "Start" }, { label: "End" }, { label: "Cut at" }, { label: "Duration", align: "right" }]}
            rows={longestFirst.map((outage) => ({
              key: outage.start,
              cells: [
                formatDateTime(outage.start),
                outage.ongoing ? "Ongoing" : formatDateTime(outage.end),
                hopLabel(outage.break_at),
                formatDuration(outage.duration_hours),
              ],
            }))}
          />
        </>
      )}
    </Panel>
  );
}
