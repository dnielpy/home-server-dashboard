import type { ComponentType } from "react";

import { AntennaIcon } from "@/components/icons/antenna-icon";
import { GlobeIcon } from "@/components/icons/globe-icon";
import type { IconProps } from "@/components/icons/icon-props";
import { RouterIcon } from "@/components/icons/router-icon";
import { TowerIcon } from "@/components/icons/tower-icon";
import type { HopInfo } from "@/lib/homenet-api";
import { type HopName, hopLabel } from "@/lib/network/hops";

/** What the sweep knows about a hop: not reached yet, being pinged, or the result of its pings. */
export type Probe =
  | { status: "pending" }
  | { status: "pinging" }
  | { status: "done"; ok: boolean; latency_ms: number | null };

// pending: not pinged yet in this sweep · pinging: pings in flight · ok: answers pings · down: no ping reply
export type HopState = "pending" | "pinging" | "ok" | "down";

export type HopView = HopInfo & {
  label: string;
  state: HopState;
  latency_ms: number | null;
  Icon: ComponentType<IconProps>;
};

export type LinkState = "idle" | "travel" | "up" | "down";

const HOP_ICONS: Record<HopName, ComponentType<IconProps>> = {
  router: RouterIcon,
  nano: AntennaIcon,
  provider: TowerIcon,
  internet: GlobeIcon,
};

export const HOP_STATE_STYLES: Record<HopState, { circle: string; status: string }> = {
  pending: { circle: "glass text-muted ring-transparent", status: "Waiting" },
  pinging: {
    circle: "bg-linear-to-br from-amber-300 to-amber-500 text-white ring-amber-500/20 shadow-[0_0_32px_-4px_rgb(245_158_11/0.8)]",
    status: "Pinging…",
  },
  ok: {
    circle: "bg-linear-to-br from-emerald-400 to-emerald-600 text-white ring-emerald-500/20 shadow-[0_0_32px_-4px_rgb(16_185_129/0.8)]",
    status: "Answering",
  },
  down: {
    circle: "bg-linear-to-br from-rose-400 to-red-600 text-white ring-red-500/20 shadow-[0_0_32px_-4px_rgb(239_68_68/0.8)]",
    status: "No ping reply",
  },
};

function hopState(probe: Probe): HopState {
  if (probe.status !== "done") return probe.status;
  return probe.ok ? "ok" : "down";
}

export function buildHopViews(hops: HopInfo[], probes: Probe[]): HopView[] {
  return hops.map((hop, index) => {
    const probe = probes[index];
    return {
      ...hop,
      label: hopLabel(hop.name),
      Icon: HOP_ICONS[hop.name as HopName] ?? GlobeIcon,
      state: hopState(probe),
      latency_ms: probe.status === "done" ? probe.latency_ms : null,
    };
  });
}

/** The link that leads into `next`. */
export function linkState(next: HopView): LinkState {
  if (next.state === "pinging") return "travel";
  if (next.state === "ok") return "up";
  return next.state === "down" ? "down" : "idle";
}

/** Where the chain is cut once every hop has been pinged: right after the last hop that answers. */
export function sweepResult(views: HopView[]): { online: boolean; breakAt: HopView | null } {
  const lastOk = views.findLastIndex((view) => view.state === "ok");
  return { online: lastOk === views.length - 1, breakAt: views[lastOk + 1] ?? null };
}
