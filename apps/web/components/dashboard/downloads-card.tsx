import { DownloadIcon } from "@/components/icons/download-icon";
import { Badge, Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Meter } from "@/components/ui/meter";
import { getLocalTube } from "@/lib/api";

const SHOWN = 3;

/** How many videos LocalTube is downloading (or has queued) right now, with the first few. */
export async function DownloadsCard() {
  const { data, error } = await load(getLocalTube);
  const title = "LocalTube downloads";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={DownloadIcon} accent="rose">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const { count, items } = data.downloading;
  return (
    <Card
      title={title}
      Icon={DownloadIcon}
      accent="rose"
      badge={
        count > 0 ? (
          <Badge tone="amber" live>
            Active
          </Badge>
        ) : undefined
      }
      footer={count > SHOWN ? `And ${count - SHOWN} more` : undefined}
    >
      <div className="flex flex-1 flex-col gap-5 sm:flex-row sm:items-end">
        <div className="shrink-0">
          <p className="text-6xl font-light tracking-tight text-foreground">
            <AnimatedNumber value={count} />
          </p>
          <p className="text-sm text-muted">{count === 1 ? "video" : "videos"} in progress</p>
        </div>
        {items.length > 0 ? (
          <ul className="flex min-w-0 flex-1 flex-col gap-3">
            {items.slice(0, SHOWN).map((item, index) => (
              <li key={item.id} className="min-w-0">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-foreground">{item.title ?? "Untitled"}</span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {item.status === "downloading" ? `${Math.round(item.progress)}%` : item.status}
                  </span>
                </div>
                <Meter
                  percent={item.progress}
                  active={item.status === "downloading"}
                  delay={0.1 * index}
                  className="mt-1.5 h-1.5"
                />
                {item.speed && item.status === "downloading" && (
                  <p className="mt-1 text-[11px] text-muted tabular-nums">
                    {item.speed}
                    {item.eta && ` · ${item.eta} left`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex-1 text-sm text-muted sm:pb-6 sm:text-right">The queue is empty.</p>
        )}
      </div>
    </Card>
  );
}
