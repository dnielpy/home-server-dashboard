import type { ComponentType } from "react";

import type { IconProps } from "@/components/icons/icon-props";
import { formatElapsedSince, formatSince } from "@/lib/format";

export type TileStatus = {
  /** Idle: it is not meant to be running, e.g. a project that was never deployed. */
  state: "up" | "down" | "idle";
  since: string | null;
  detail: string | null;
};

const STYLES = {
  up: {
    accent: "accent-emerald",
    border: "",
    icon: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    label: "Online",
  },
  down: {
    accent: "accent-rose",
    border: "border-red-500/30!",
    icon: "bg-red-500/12 text-red-600 shadow-[0_0_20px_-4px_rgb(239_68_68/0.7)] dark:text-red-400",
    pill: "bg-red-500/10 text-red-600 dark:text-red-400",
    label: "Down",
  },
  idle: {
    accent: "accent-sky",
    border: "",
    icon: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300",
    pill: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
    label: "Not deployed",
  },
};

/** A square card for an app: green while it runs, red while it does not, and since when. */
export function StatusTile({
  name,
  Icon,
  status,
  unknownMessage,
}: {
  name: string;
  Icon: ComponentType<IconProps>;
  /** Undefined when whoever reports it could not be reached. */
  status?: TileStatus;
  unknownMessage: string;
}) {
  const style = STYLES[status?.state ?? "down"];

  return (
    <div
      title={status?.detail ?? undefined}
      className={`glass glass-glow ${style.accent} flex min-h-36 flex-col justify-between gap-3 rounded-2xl p-3.5 sm:aspect-square sm:min-h-0 ${style.border}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-medium ${style.pill}`}>
          {status?.state !== "idle" && <span aria-hidden className="pulse-dot h-1.5 w-1.5" />}
          {style.label}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        {status?.state === "idle" ? (
          <p className="text-xs text-muted">No containers yet</p>
        ) : status?.since ? (
          <>
            <p className="truncate text-lg font-semibold text-foreground tabular-nums">
              {formatElapsedSince(status.since)}
            </p>
            <p className="truncate text-xs text-muted tabular-nums">
              {status.state === "up" ? "Up" : "Down"} since {formatSince(status.since)}
            </p>
          </>
        ) : status ? (
          <p className="truncate text-xs text-muted">{status.detail ?? "Since unknown"}</p>
        ) : (
          <p className="text-xs text-muted">{unknownMessage}</p>
        )}
      </div>
    </div>
  );
}
