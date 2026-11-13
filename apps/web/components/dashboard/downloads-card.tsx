import { DownloadIcon } from "@/components/icons/download-icon";
import { Badge, Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { getLocalTube } from "@/lib/api";

const SHOWN = 3;

/** How many videos LocalTube is downloading (or has queued) right now, with the first few. */
export async function DownloadsCard() {
  const { data, error } = await load(getLocalTube);
  const title = "LocalTube downloads";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={DownloadIcon}>
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const { count, items } = data.downloading;
  return (
    <Card
      title={title}
      Icon={DownloadIcon}
      badge={count > 0 ? <Badge tone="amber">Active</Badge> : undefined}
      footer={count > SHOWN ? `And ${count - SHOWN} more` : undefined}
    >
      <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-end">
        <div className="shrink-0">
          <p className="text-5xl font-light text-zinc-900 tabular-nums dark:text-zinc-50">{count}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{count === 1 ? "video" : "videos"} in progress</p>
        </div>
        {items.length > 0 && (
          <ul className="flex min-w-0 flex-1 flex-col gap-2">
            {items.slice(0, SHOWN).map((item) => (
              <li key={item.id} className="min-w-0">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-zinc-700 dark:text-zinc-200">{item.title ?? "Untitled"}</span>
                  <span className="shrink-0 text-zinc-500 tabular-nums dark:text-zinc-400">
                    {item.status === "downloading" ? `${Math.round(item.progress)}%` : item.status}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${item.progress}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
