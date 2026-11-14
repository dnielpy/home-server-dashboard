"use client";

import { Card, CardSkeleton, CardUnavailable } from "@/components/dashboard/card";
import { useSystem } from "@/components/dashboard/system-live";
import { ClockIcon } from "@/components/icons/clock-icon";
import type { Boot } from "@/lib/api";
import { formatElapsed, formatElapsedSince, formatSince } from "@/lib/format";

// Off for less than this after a clean shutdown, it was a restart rather than a power off
const RESTART_MAX_OFF_MS = 10 * 60_000;

function LastShutdown({ boot }: { boot: Boot }) {
  const last = boot.last_shutdown;
  if (!last) return <p className="text-sm text-muted">The agent cannot read how it last went off.</p>;

  const offMs = boot.booted_at ? Date.parse(boot.booted_at) - Date.parse(last.at) : null;
  let label;
  let tone;
  if (!last.clean) {
    label = "Last power cut";
    tone = "bg-red-500";
  } else if (offMs !== null && offMs < RESTART_MAX_OFF_MS) {
    label = "Last restart";
    tone = "bg-sky-500";
  } else {
    label = "Last power off";
    tone = "bg-zinc-400";
  }

  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        {label}
      </p>
      <p className="text-lg font-semibold text-foreground tabular-nums">{formatSince(last.at)}</p>
      <p className="text-sm text-muted tabular-nums">
        {offMs !== null && `off for ${formatElapsed(offMs)}`}
        {!last.clean && " · it went off without shutting down (power lost or hung)"}
      </p>
    </div>
  );
}

/** How long the server has been on without going off, and when and how it last went off. */
export function UptimeCard() {
  const { data, error } = useSystem();
  const boot = data?.boot;
  if (!boot?.booted_at) {
    if (!data && !error) return <CardSkeleton />;
    return (
      <Card title="Uptime" Icon={ClockIcon} accent="emerald">
        <CardUnavailable message={data ? "The agent does not say when the server booted." : error!} />
      </Card>
    );
  }

  return (
    <Card title="Uptime" Icon={ClockIcon} accent="emerald">
      <div className="grid flex-1 items-end gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-4xl font-semibold tracking-tight text-foreground tabular-nums xl:text-5xl">
            {formatElapsedSince(boot.booted_at)}
          </p>
          <p className="text-sm text-muted tabular-nums">on since {formatSince(boot.booted_at)}</p>
        </div>
        <LastShutdown boot={boot} />
      </div>
    </Card>
  );
}
