import { ChartLegend } from "@/components/network/chart-legend";
import type { Segment } from "@/lib/homenet-api";
import { STATUS_COLORS } from "@/lib/network/chart-colors";
import { formatTimeTick, formatTooltipTime, timeTicks } from "@/lib/network/chart-time";
import { hopLabel } from "@/lib/network/hops";
import { formatElapsed } from "@/lib/network/outage-format";

// Ticks are laid out for a typical card width; every other one hides on small screens
const ASSUMED_WIDTH_PX = 720;
// The latest check counts as the current state for this long after it
const MAX_CHECK_GAP_MS = 5 * 60_000;

export type TimelineSpan = { start: number; end: number; online: boolean | null; break_at: string | null };

export function buildSpans(segments: Segment[], from: number, to: number): TimelineSpan[] {
  const spans: TimelineSpan[] = segments
    .map((segment) => ({
      start: Math.max(from, Date.parse(segment.start)),
      end: Math.min(to, Date.parse(segment.end)),
      online: segment.online,
      break_at: segment.break_at,
    }))
    .filter((span) => span.end >= span.start);

  const last = spans.at(-1);
  if (last && to - last.end <= MAX_CHECK_GAP_MS) last.end = to;
  else if (last) spans.push({ start: last.end, end: to, online: null, break_at: null });
  return spans;
}

export function TimelineLegend() {
  return (
    <ChartLegend
      items={[
        { label: "Online", color: STATUS_COLORS.online },
        { label: "Offline", color: STATUS_COLORS.offline },
        { label: "No data", color: STATUS_COLORS.noData },
      ]}
    />
  );
}

function spanLabel(span: TimelineSpan): string {
  if (span.online === null) return "No data";
  return span.online ? "Online" : `Offline · cut at ${hopLabel(span.break_at)}`;
}

function spanClass(span: TimelineSpan): string {
  if (span.online === null) return "bg-slate-500/40";
  return span.online
    ? "bg-linear-to-b from-emerald-400 to-emerald-600"
    : "bg-linear-to-b from-rose-500 to-red-600 shadow-[0_0_16px_rgb(239_68_68/0.6)]";
}

function spanColor(span: TimelineSpan): string {
  if (span.online === null) return STATUS_COLORS.noData;
  return span.online ? STATUS_COLORS.online : STATUS_COLORS.offline;
}

type ConnectionTimelineProps = {
  spans: TimelineSpan[];
  from: number;
  to: number;
  /** Hidden when several timelines stack and share one legend. */
  legend?: boolean;
};

/** A day (or any range) as one bar: green while internet answered, red while it was cut. */
export function ConnectionTimeline({ spans, from, to, legend = true }: ConnectionTimelineProps) {
  const range = to - from;
  const percent = (t: number) => `${((t - from) / range) * 100}%`;
  const ticks = timeTicks(from, to, ASSUMED_WIDTH_PX);

  return (
    <div className="flex flex-col gap-3">
      {legend && <TimelineLegend />}
      <div className="relative">
        <ul aria-label="Connection timeline" className="relative h-9 rounded-xl bg-track">
          {spans.map((span, index) => (
            <li
              key={index}
              tabIndex={0}
              aria-label={`${spanLabel(span)} from ${formatTooltipTime(span.start)} to ${formatTooltipTime(span.end)}`}
              className="group absolute inset-y-0 outline-none"
              style={{ left: percent(span.start), width: `max(2px, ${((span.end - span.start) / range) * 100}%)` }}
            >
              <span
                className={`block h-full transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 ${spanClass(span)}`}
              />
              <span className="glass pointer-events-none invisible absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-xl px-3 py-2 text-xs shadow-xl group-hover:visible group-focus-visible:visible">
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: spanColor(span) }} />
                  <span className="text-sm font-semibold text-foreground">{spanLabel(span)}</span>
                </span>
                <span className="mt-0.5 block whitespace-nowrap text-muted tabular-nums">
                  {formatTooltipTime(span.start)} → {formatTooltipTime(span.end)} · {formatElapsed(span.end - span.start)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div aria-hidden className="relative mt-1.5 h-5 text-[11px]">
          {ticks.map((tick, index) => (
            <span
              key={tick}
              className={`absolute -translate-x-1/2 whitespace-nowrap text-muted tabular-nums ${
                index % 2 === 1 ? "hidden sm:inline" : ""
              }`}
              style={{ left: percent(tick) }}
            >
              {formatTimeTick(tick, range)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
