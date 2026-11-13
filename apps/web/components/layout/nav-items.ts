import type { ComponentType } from "react";

import { BatteryIcon } from "@/components/icons/battery-icon";
import { BlackoutIcon } from "@/components/icons/blackout-icon";
import { BoltIcon } from "@/components/icons/bolt-icon";
import { ChartIcon } from "@/components/icons/chart-icon";
import { DashboardIcon } from "@/components/icons/dashboard-icon";
import { DevicesIcon } from "@/components/icons/devices-icon";
import { GaugeIcon } from "@/components/icons/gauge-icon";
import type { IconProps } from "@/components/icons/icon-props";
import { RouterIcon } from "@/components/icons/router-icon";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { WrenchIcon } from "@/components/icons/wrench-icon";

export type NavLink = {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  /** Also active on the pages under it, e.g. a device under Devices. */
  matchPrefix?: boolean;
};

/** A module of the sidebar that folds its pages under one entry. */
export type NavGroup = {
  label: string;
  Icon: ComponentType<IconProps>;
  children: NavLink[];
};

export type NavEntry = NavLink | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

export function isActive(link: NavLink, pathname: string): boolean {
  return pathname === link.href || (link.matchPrefix === true && pathname.startsWith(`${link.href}/`));
}

export const NAV_ITEMS: NavEntry[] = [
  { href: "/", label: "Dashboard", Icon: DashboardIcon },
  {
    label: "Energy",
    Icon: BoltIcon,
    children: [
      { href: "/energy", label: "Live", Icon: DashboardIcon },
      { href: "/energy/battery", label: "Battery", Icon: BatteryIcon },
      { href: "/energy/blackouts", label: "Blackouts", Icon: BlackoutIcon },
    ],
  },
  {
    label: "Network",
    Icon: TrafficIcon,
    children: [
      { href: "/network", label: "Live", Icon: DashboardIcon },
      { href: "/network/speed-test", label: "Speed test", Icon: GaugeIcon },
      { href: "/network/local-speed", label: "Local speed", Icon: RouterIcon },
      { href: "/network/stats", label: "Stats", Icon: ChartIcon },
      { href: "/network/devices", label: "Devices", Icon: DevicesIcon, matchPrefix: true },
    ],
  },
  { href: "/management", label: "Management", Icon: WrenchIcon },
];
