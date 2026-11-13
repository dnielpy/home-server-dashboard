import { PlayIcon } from "@/components/icons/play-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { Meter } from "@/components/ui/meter";
import { getLocalTube } from "@/lib/api";

function formatWatched(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(hours >= 10 ? 0 : 1)} h`;
  return `${Math.round(seconds / 60)} min`;
}

// The first profile gets the boldest bar, the rest fade out from it
const BARS = [
  "bg-linear-to-r from-rose-500 to-fuchsia-500",
  "bg-linear-to-r from-rose-500/80 to-fuchsia-500/80",
  "bg-linear-to-r from-rose-500/60 to-fuchsia-500/60",
];

/** Hours each LocalTube profile has watched since watch time started being recorded. */
export async function WatchTimeCard() {
  const { data, error } = await load(getLocalTube);
  const title = "LocalTube watch time";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={PlayIcon} accent="rose">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const rows = data.watch_time;
  const most = Math.max(...rows.map((row) => row.seconds), 1);
  return (
    <Card title={title} Icon={PlayIcon} accent="rose" footer="All time, since LocalTube started recording it">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">LocalTube has no profiles yet.</p>
      ) : (
        <ul className="flex flex-1 flex-col justify-center gap-3.5">
          {rows.map((row, index) => (
            <li key={row.profile_id} className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-fuchsia-600 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgb(244_63_94/0.6)]"
              >
                {row.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground">{row.name}</span>
                  <span className="shrink-0 text-muted tabular-nums">{formatWatched(row.seconds)}</span>
                </div>
                <Meter
                  percent={(row.seconds / most) * 100}
                  barClassName={BARS[Math.min(index, BARS.length - 1)]}
                  delay={0.12 * index}
                  className="mt-1.5 h-2"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
