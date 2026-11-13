import type { ComponentType } from "react";

import { BatteryIcon } from "@/components/icons/battery-icon";
import { BlackoutIcon } from "@/components/icons/blackout-icon";
import { BoltIcon } from "@/components/icons/bolt-icon";
import { DashboardIcon } from "@/components/icons/dashboard-icon";
import type { IconProps } from "@/components/icons/icon-props";
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
  { href: "/management", label: "Management", Icon: WrenchIcon },
];
