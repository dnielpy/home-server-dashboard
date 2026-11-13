import { PlayIcon } from "@/components/icons/play-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { getLocalTube } from "@/lib/api";

function formatWatched(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(hours >= 10 ? 0 : 1)} h`;
  return `${Math.round(seconds / 60)} min`;
}

/** Hours each LocalTube profile has watched since watch time started being recorded. */
export async function WatchTimeCard() {
  const { data, error } = await load(getLocalTube);
  const title = "LocalTube watch time";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={PlayIcon}>
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const rows = data.watch_time;
  const most = Math.max(...rows.map((row) => row.seconds), 1);
  return (
    <Card title={title} Icon={PlayIcon} footer="All time, since LocalTube started recording it">
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">LocalTube has no profiles yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.profile_id} className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400"
              >
                {row.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">{row.name}</span>
                  <span className="shrink-0 text-zinc-500 tabular-nums dark:text-zinc-400">
                    {formatWatched(row.seconds)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${(row.seconds / most) * 100}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
