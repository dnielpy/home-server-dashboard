"use client";

import { Fragment, useEffect, useState } from "react";

import { ConnectedBadge } from "@/components/network/connection-chain/connected-badge";
import { HopLink } from "@/components/network/connection-chain/hop-link";
import { HopNode } from "@/components/network/connection-chain/hop-node";
import { buildHopViews, linkState, sweepResult } from "@/components/network/connection-chain/hop-state";
import { useChainSweep } from "@/components/network/connection-chain/use-chain-sweep";
import { RefreshIcon } from "@/components/icons/refresh-icon";
import type { HopInfo, LatestCheck } from "@/lib/homenet-api";

// How long the hops flash together before they collapse into the "Connected" ball
const CELEBRATION_MS = 1_000;

function minutesAgo(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return minutes < 1 ? "just now" : `${minutes} min ago`;
}

type ConnectionChainProps = {
  hops: HopInfo[];
  latest: LatestCheck | null;
};

export function ConnectionChain({ hops, latest }: ConnectionChainProps) {
  const { probes, phase, sweep, apiError, checkedAt, restored, restart } = useChainSweep(hops, latest);
  const views = buildHopViews(hops, probes);
  const done = phase.kind === "done";
  const [now, setNow] = useState<number | null>(null);

  // Keeps "checked … ago" current without reading the clock while rendering
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [checkedAt]);
  const { online, breakAt } = sweepResult(views);
  const internet = views.at(-1);
  const connected = done && online && !apiError;

  // Sweep whose chain has collapsed into the "Connected" ball; a restored result starts collapsed
  const [collapsedSweep, setCollapsedSweep] = useState<number | null>(connected && restored ? sweep : null);
  useEffect(() => {
    if (!connected) return;
    // Lets the hops play their celebration flash before they collapse
    const id = setTimeout(() => setCollapsedSweep(sweep), restored ? 0 : CELEBRATION_MS);
    return () => clearTimeout(id);
  }, [connected, restored, sweep]);
  const collapsed = connected && collapsedSweep === sweep;

  let headline;
  if (phase.kind === "pinging") {
    headline = <span className="text-foreground">Checking {views[phase.index]?.label}…</span>;
  } else if (apiError) {
    headline = <span className="text-foreground">API unavailable</span>;
  } else if (online) {
    headline = (
      <span className="text-foreground">
        <span key={sweep} className={restored ? undefined : "text-flash"}>
          Online
        </span>
        {internet?.latency_ms != null && (
          <span className="font-normal text-muted"> · {internet.latency_ms.toFixed(0)} ms to internet</span>
        )}
      </span>
    );
  } else {
    headline = <span className="text-red-600 dark:text-red-400">Cut at {breakAt?.label}</span>;
  }

  return (
    <section aria-labelledby="connection-chain-title" className="mx-auto flex w-full max-w-4xl flex-col items-center gap-10 py-4">
      <div className="text-center">
        <h2 id="connection-chain-title" className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">
          Connection
        </h2>
        <p aria-live="polite" className="mt-1 text-2xl font-semibold tracking-tight">
          {headline}
        </p>
        <p className="mt-1 text-xs text-muted tabular-nums">
          {done && checkedAt !== null && now !== null
            ? `Checked ${minutesAgo(now - checkedAt)} · the server checks every 30 seconds`
            : "3 seconds of pings per hop, the average is the latency"}
        </p>
      </div>

      {collapsed ? (
        <ConnectedBadge key={sweep} animate={!restored} />
      ) : (
        <ol aria-label="Connection chain" className="flex w-full flex-col md:flex-row md:items-start">
          {views.map((hop, index) => (
            <Fragment key={hop.name}>
              {index > 0 && <HopLink state={linkState(hop)} />}
              <HopNode hop={hop} sweep={sweep} animate={!restored} celebrate={connected} />
            </Fragment>
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={restart}
        disabled={!done}
        className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshIcon className={`h-4 w-4 ${done ? "" : "animate-spin"}`} />
        {done ? "Check again" : "Checking…"}
      </button>
    </section>
  );
}
