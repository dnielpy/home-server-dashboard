import type { ComponentType } from "react";

import { BatteryIcon } from "@/components/icons/battery-icon";
import type { IconProps } from "@/components/icons/icon-props";
import { PlayIcon } from "@/components/icons/play-icon";
import { ServerIcon } from "@/components/icons/server-icon";
import { TrafficIcon } from "@/components/icons/traffic-icon";

// The projects on the server, by their folder; any other folder shows with its own name
export const KNOWN_PROJECTS: { folder: string; name: string; Icon: ComponentType<IconProps> }[] = [
  { folder: "bluetti-powerstation-api", name: "Bluetti", Icon: BatteryIcon },
  { folder: "home-net-dashboard", name: "Home Net", Icon: TrafficIcon },
  { folder: "local-tube", name: "LocalTube", Icon: PlayIcon },
  { folder: "home-server-dashboard", name: "Home Server", Icon: ServerIcon },
];

export function projectMeta(folder: string): { name: string; Icon: ComponentType<IconProps> } {
  return KNOWN_PROJECTS.find((project) => project.folder === folder) ?? { name: folder, Icon: ServerIcon };
}
