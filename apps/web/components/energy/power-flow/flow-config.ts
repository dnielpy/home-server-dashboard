import type { ComponentType } from "react";

import { AcOutletIcon } from "@/components/icons/ac-outlet-icon";
import { DcOutletIcon } from "@/components/icons/dc-outlet-icon";
import { GridIcon } from "@/components/icons/grid-icon";
import type { IconProps } from "@/components/icons/icon-props";
import { SolarIcon } from "@/components/icons/solar-icon";
import type { Summary } from "@/lib/bluetti-api";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type Direction = "in" | "out";

export type FlowNodeData = {
  label: string;
  watts: number;
  corner: Corner;
  direction: Direction;
  path: string;
  Icon: ComponentType<IconProps>;
};

// Power coming in is green, power going out amber, as on the dashboard
export const ACTIVE_STYLES: Record<Direction, { circle: string; stroke: string }> = {
  in: {
    circle: "bg-linear-to-br from-emerald-400 to-emerald-600 shadow-[0_0_32px_-4px_rgb(16_185_129/0.8)] ring-emerald-500/20",
    stroke: "stroke-emerald-500",
  },
  out: {
    circle: "bg-linear-to-br from-amber-300 to-amber-500 shadow-[0_0_32px_-4px_rgb(245_158_11/0.8)] ring-amber-500/20",
    stroke: "stroke-amber-500",
  },
};

export const CORNER_POSITION: Record<Corner, { node: string; text: string }> = {
  "top-left": { node: "left-[15%] top-[15%]", text: "left-[24%] top-[15%] items-start" },
  "top-right": { node: "left-[85%] top-[15%]", text: "right-[24%] top-[15%] items-end" },
  "bottom-left": { node: "left-[15%] top-[85%]", text: "left-[24%] top-[85%] items-start" },
  "bottom-right": { node: "left-[85%] top-[85%]", text: "right-[24%] top-[85%] items-end" },
};

export function buildFlowNodes(summary: Summary): FlowNodeData[] {
  return [
    {
      label: "Solar",
      watts: summary.dc_input,
      corner: "top-left",
      direction: "in",
      path: "M60 60 V160 Q60 186 86 186 H128",
      Icon: SolarIcon,
    },
    {
      label: "Grid",
      watts: summary.ac_input,
      corner: "top-right",
      direction: "in",
      path: "M340 60 V160 Q340 186 314 186 H272",
      Icon: GridIcon,
    },
    {
      label: "DC",
      watts: summary.dc_output,
      corner: "bottom-left",
      direction: "out",
      path: "M60 340 V240 Q60 214 86 214 H128",
      Icon: DcOutletIcon,
    },
    {
      label: "AC",
      watts: summary.ac_output,
      corner: "bottom-right",
      direction: "out",
      path: "M340 340 V240 Q340 214 314 214 H272",
      Icon: AcOutletIcon,
    },
  ];
}
