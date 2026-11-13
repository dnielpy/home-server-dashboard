import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { PeriodBars } from "@/components/energy/period-bars";
import { BlackoutIcon } from "@/components/icons/blackout-icon";
import { BoltIcon } from "@/components/icons/bolt-icon";
import { DataTable } from "@/components/ui/data-table";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { RangeFilter } from "@/components/ui/range-filter";
import { getPowerPeriods } from "@/lib/bluetti-api";
import { formatDateTime, formatDuration } from "@/lib/energy/blackout-format";
import { longestPeriods } from "@/lib/energy/power-periods";
import { parseTimeRange, TIME_RANGES } from "@/lib/energy/time-ranges";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LIMIT = 10;

const KINDS = {
  blackout: {
    title: "Longest blackouts",
    label: "Blackout",
    empty: "No blackouts in this period.",
    tone: "red",
    accent: "rose",
    Icon: BlackoutIcon,
    param: "blackoutRankHours",
    receivingAc: false,
  },
  power: {
    title: "Longest periods with power",
    label: "Period with power",
    empty: "No periods with power in this period.",
    tone: "green",
    accent: "emerald",
    Icon: BoltIcon,
    param: "powerRankHours",
    receivingAc: true,
  },
} as const;

/** The longest blackouts (or periods with power) in the range, longest first. */
export async function PeriodRanking({ kind, searchParams }: { kind: keyof typeof KINDS; searchParams: SearchParams }) {
  const config = KINDS[kind];
  const params = await searchParams;
  const range = parseTimeRange(params[config.param], TIME_RANGES);
  const { data, error } = await load(() => getPowerPeriods(range.hours));
  const periods = data ? longestPeriods(data.periods, config.receivingAc, LIMIT) : [];

  return (
    <Panel
      id={`${kind}-ranking-title`}
      title={config.title}
      subtitle={`${range.description} · top ${LIMIT}`}
      Icon={config.Icon}
      accent={config.accent}
      actions={
        <RangeFilter
          label={`${config.title} time range`}
          param={config.param}
          ranges={TIME_RANGES}
          selected={range}
          searchParams={params}
          path="/energy/blackouts"
        />
      }
    >
      {error !== undefined ? (
        <CardUnavailable message={error} />
      ) : periods.length === 0 ? (
        <PanelEmpty height={128}>{config.empty}</PanelEmpty>
      ) : (
        <>
          <PeriodBars periods={periods} tone={config.tone} label={config.label} />
          <DataTable
            columns={[{ label: "Start" }, { label: "End" }, { label: "Duration", align: "right" }]}
            rows={periods.map((period) => ({
              key: period.start,
              cells: [
                formatDateTime(period.start),
                period.ongoing ? "Ongoing" : formatDateTime(period.end),
                formatDuration(period.duration_hours),
              ],
            }))}
          />
        </>
      )}
    </Panel>
  );
}
