import type { Blackout } from "@/lib/bluetti-api";
import { formatDateTime, formatDuration, formatTick, hourTicks } from "@/lib/energy/blackout-format";

const TONES = {
  red: { bar: "bg-linear-to-r from-red-500/70 to-rose-500 shadow-[0_0_18px_-4px_rgb(239_68_68/0.8)]", dot: "bg-red-500" },
  green: {
    bar: "bg-linear-to-r from-emerald-500/70 to-emerald-400 shadow-[0_0_18px_-4px_rgb(16_185_129/0.8)]",
    dot: "bg-emerald-500",
  },
};

type PeriodBarsProps = {
  periods: Blackout[];
  /** Red for blackouts; the same chart ranks periods with power in green. */
  tone: keyof typeof TONES;
  label: string;
};

/** The periods as horizontal bars, longest first, on a shared hour scale. The one still going on is striped. */
export function PeriodBars({ periods, tone, label }: PeriodBarsProps) {
  const ticks = hourTicks(Math.max(...periods.map((period) => period.duration_hours)));
  const top = ticks.at(-1)!;
  const percent = (hours: number) => `${(hours / top) * 100}%`;
  const style = TONES[tone];

  return (
    <div className="flex text-xs">
      <ul className="w-28 shrink-0 sm:w-32" aria-hidden>
        {periods.map((period) => (
          <li key={period.start} className="flex h-9 items-center pr-3 text-muted tabular-nums">
            {formatDateTime(period.start)}
          </li>
        ))}
      </ul>

      <div className="relative min-w-0 flex-1">
        {/* Room after the axis for the label of the longest bar, wider when it can read "· ongoing" */}
        <div className={`relative ${periods.some((period) => period.ongoing) ? "mr-28" : "mr-14"}`}>
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="absolute top-0 w-px bg-surface-border"
              style={{ left: percent(tick), height: `${periods.length * 2.25}rem` }}
            />
          ))}

          <ul aria-label={`${label}s`}>
            {periods.map((period) => (
              <li
                key={period.start}
                tabIndex={0}
                aria-label={`${label} from ${formatDateTime(period.start)} ${
                  period.ongoing ? "still ongoing" : `to ${formatDateTime(period.end)}`
                }, ${formatDuration(period.duration_hours)}`}
                className="group relative flex h-9 items-center outline-none"
              >
                <span
                  className={`block h-4.5 min-w-1 rounded-full transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 ${style.bar} ${
                    period.ongoing ? "shimmer" : ""
                  }`}
                  style={{ width: percent(period.duration_hours) }}
                />
                <span
                  className="absolute pl-2 font-medium whitespace-nowrap text-foreground tabular-nums"
                  style={{ left: percent(period.duration_hours) }}
                >
                  {formatDuration(period.duration_hours)}
                  {period.ongoing && <span className="font-normal text-muted"> · ongoing</span>}
                </span>

                <span className="glass pointer-events-none invisible absolute bottom-full left-0 z-10 mb-1 rounded-xl px-3 py-2 shadow-xl group-hover:visible group-focus-visible:visible">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatDuration(period.duration_hours)}
                    </span>
                    {period.ongoing && <span className="text-muted">Ongoing</span>}
                  </span>
                  <span className="mt-0.5 block whitespace-nowrap text-muted tabular-nums">
                    {formatDateTime(period.start)} → {period.ongoing ? "now" : formatDateTime(period.end)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div aria-hidden className="relative mt-1 h-5">
            {ticks.map((tick, index) => (
              <span
                key={tick}
                className={`absolute -translate-x-1/2 whitespace-nowrap text-muted tabular-nums ${
                  index % 2 === 1 ? "hidden sm:inline" : ""
                }`}
                style={{ left: percent(tick) }}
              >
                {formatTick(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
