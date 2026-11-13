import type { ComponentType } from "react";

import { load } from "@/components/dashboard/load";
import { BatteryIcon } from "@/components/icons/battery-icon";
import type { IconProps } from "@/components/icons/icon-props";
import { PlayIcon } from "@/components/icons/play-icon";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { getStatus, type SourceStatus as Status } from "@/lib/api";
import { formatElapsedSince, formatSince } from "@/lib/format";

const SOURCES: { source: Status["source"]; name: string; Icon: ComponentType<IconProps> }[] = [
  { source: "bluetti", name: "Bluetti", Icon: BatteryIcon },
  { source: "homenet", name: "Home Net", Icon: TrafficIcon },
  { source: "localtube", name: "LocalTube", Icon: PlayIcon },
];

function StatusCard({
  name,
  Icon,
  status,
}: {
  name: string;
  Icon: ComponentType<IconProps>;
  /** Undefined when the dashboard API itself could not be reached. */
  status?: Status;
}) {
  const up = status?.up ?? false;

  return (
    <div
      title={status?.detail ?? undefined}
      className={`glass glass-glow ${up ? "accent-emerald" : "accent-rose"} flex min-h-36 flex-col justify-between gap-3 rounded-2xl p-3.5 sm:aspect-square sm:min-h-0 ${
        up ? "" : "border-red-500/30!"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            up
              ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/12 text-red-600 shadow-[0_0_20px_-4px_rgb(239_68_68/0.7)] dark:text-red-400"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-medium ${
            up
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          <span aria-hidden className="pulse-dot h-1.5 w-1.5" />
          {up ? "Online" : "Down"}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        {status ? (
          <>
            <p className="truncate text-lg font-semibold text-foreground tabular-nums">
              {formatElapsedSince(status.since)}
            </p>
            <p className="truncate text-xs text-muted tabular-nums">
              {up ? "Up" : "Down"} since {formatSince(status.since)}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">Unknown, the dashboard API is not answering</p>
        )}
      </div>
    </div>
  );
}

/** One card per app: green while it answers its health check, red while it does not, and since when. */
export async function SourceStatus() {
  const { data } = await load(getStatus);
  return (
    <div className="grid w-full grid-cols-3 gap-3 sm:w-auto sm:grid-cols-[repeat(3,10rem)] xl:grid-cols-[repeat(3,11rem)]">
      {SOURCES.map(({ source, name, Icon }) => (
        <StatusCard
          key={source}
          name={name}
          Icon={Icon}
          status={data?.find((item) => item.source === source)}
        />
      ))}
    </div>
  );
}

export function SourceStatusSkeleton() {
  return (
    <div className="grid w-full grid-cols-3 gap-3 sm:w-auto sm:grid-cols-[repeat(3,10rem)] xl:grid-cols-[repeat(3,11rem)]">
      {SOURCES.map(({ source }) => (
        <div key={source} className="glass shimmer min-h-36 rounded-2xl sm:aspect-square sm:min-h-0" />
      ))}
    </div>
  );
}
