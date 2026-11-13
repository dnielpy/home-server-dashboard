import type { ComponentType } from "react";

import { load } from "@/components/dashboard/load";
import { BatteryIcon } from "@/components/icons/battery-icon";
import type { IconProps } from "@/components/icons/icon-props";
import { PlayIcon } from "@/components/icons/play-icon";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { StatusTile } from "@/components/ui/status-tile";
import { getStatus, type SourceStatus as Status } from "@/lib/api";

const SOURCES: { source: Status["source"]; name: string; Icon: ComponentType<IconProps> }[] = [
  { source: "bluetti", name: "Bluetti", Icon: BatteryIcon },
  { source: "homenet", name: "Home Net", Icon: TrafficIcon },
  { source: "localtube", name: "LocalTube", Icon: PlayIcon },
];

/** One card per app: green while it answers its health check, red while it does not, and since when. */
export async function SourceStatus() {
  const { data } = await load(getStatus);
  return (
    <div className="grid w-full grid-cols-3 gap-3 sm:w-auto sm:grid-cols-[repeat(3,10rem)] xl:grid-cols-[repeat(3,11rem)]">
      {SOURCES.map(({ source, name, Icon }) => {
        const status = data?.find((item) => item.source === source);
        return (
          <StatusTile
            key={source}
            name={name}
            Icon={Icon}
            status={status && { state: status.up ? "up" : "down", since: status.since, detail: status.detail }}
            unknownMessage="Unknown, the dashboard API is not answering"
          />
        );
      })}
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
