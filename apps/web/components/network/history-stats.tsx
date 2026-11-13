import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { ClockIcon } from "@/components/icons/clock-icon";
import {
  buildSpans,
  ConnectionTimeline,
  type TimelineSpan,
  TimelineLegend,
} from "@/components/network/connection-timeline";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { RangeFilter } from "@/components/ui/range-filter";
import { getDailyHistory } from "@/lib/homenet-api";
import { DAY_RANGES, parseTimeRange } from "@/lib/network/time-ranges";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function onlineShare(spans: TimelineSpan[]): { measuredMs: number; onlineMs: number } {
  const measured = spans.filter((span) => span.online !== null);
  return {
    measuredMs: measured.reduce((sum, span) => sum + span.end - span.start, 0),
    onlineMs: measured.filter((span) => span.online).reduce((sum, span) => sum + span.end - span.start, 0),
  };
}

function formatUptime({ measuredMs, onlineMs }: { measuredMs: number; onlineMs: number }): string {
  return measuredMs > 0 ? `${((onlineMs / measuredMs) * 100).toFixed(1)}% online` : "No checks";
}

function formatDay(dayStart: number, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(dayStart);
}

/** Online and offline periods per day, today first: each bar runs from 00:00 to midnight, whatever the time is now. */
export async function HistoryStats({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const range = parseTimeRange(params.historyHours, DAY_RANGES, DAY_RANGES[0]);
  const dayCount = range.hours / 24;
  const { data: history, error } = await load(() => getDailyHistory(dayCount));

  const filter = (
    <RangeFilter
      label="Online / offline days"
      param="historyHours"
      ranges={DAY_RANGES}
      selected={range}
      searchParams={params}
      path="/network/stats"
    />
  );

  if (error !== undefined) {
    return (
      <Panel id="history-chart-title" title="Online / offline" Icon={ClockIcon} accent="emerald" actions={filter}>
        <CardUnavailable message={error} />
      </Panel>
    );
  }

  // The rest of today has not happened yet, so its spans stop at the moment of the fetch
  const days = history.days.map((day) => {
    const spans = buildSpans(day.segments, day.dayStart, Math.min(day.dayEnd, history.fetchedAt));
    return { ...day, spans, share: onlineShare(spans) };
  });
  const total = days.reduce(
    (sum, day) => ({ measuredMs: sum.measuredMs + day.share.measuredMs, onlineMs: sum.onlineMs + day.share.onlineMs }),
    { measuredMs: 0, onlineMs: 0 },
  );
  const subtitle = dayCount === 1 ? "Today, 00:00 to 23:59" : `Last ${dayCount} days`;

  return (
    <Panel
      id="history-chart-title"
      title="Online / offline"
      subtitle={`${subtitle} · ${formatUptime(total)}`}
      Icon={ClockIcon}
      accent="emerald"
      actions={filter}
    >
      {dayCount === 1 ? (
        days[0].segments.length === 0 ? (
          <PanelEmpty height={80}>No checks today yet.</PanelEmpty>
        ) : (
          <ConnectionTimeline spans={days[0].spans} from={days[0].dayStart} to={days[0].dayEnd} />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <TimelineLegend />
          {days.map((day, index) => (
            <div key={day.dayStart} className="flex flex-col gap-1.5">
              <p className="text-sm text-muted">
                <span className="font-medium text-foreground">{formatDay(day.dayStart, index)}</span>
                {" · "}
                {formatUptime(day.share)}
              </p>
              {day.segments.length === 0 ? (
                <PanelEmpty height={36}>No checks this day.</PanelEmpty>
              ) : (
                <ConnectionTimeline spans={day.spans} from={day.dayStart} to={day.dayEnd} legend={false} />
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
