"use client";

import { useState } from "react";

import type { Outage } from "@/lib/homenet-api";
import { hopLabel } from "@/lib/network/hops";
import { formatDateTime, formatDuration, formatTick, hourTicks } from "@/lib/network/outage-format";

// Rows shown until "Show more" is pressed
const COLLAPSED_COUNT = 5;

/** The outages as red bars, longest first, on a shared hour scale. The one still going on shimmers. */
export function OutageChart({ outages: all }: { outages: Outage[] }) {
  const [expanded, setExpanded] = useState(false);
  const outages = expanded ? all : all.slice(0, COLLAPSED_COUNT);
  const hidden = all.length - outages.length;
  // The scale fits every outage, so it does not jump when the list expands
  const ticks = hourTicks(Math.max(...all.map((outage) => outage.duration_hours)));
  const top = ticks.at(-1)!;
  const percent = (hours: number) => `${(hours / top) * 100}%`;

  return (
    <div>
      <div className="flex text-xs">
        <ul className="w-24 shrink-0 sm:w-32" aria-hidden>
          {outages.map((outage) => (
            <li key={outage.start} className="flex h-9 items-center pr-3 text-muted tabular-nums">
              {formatDateTime(outage.start)}
            </li>
          ))}
        </ul>

        <div className="relative min-w-0 flex-1">
          <div className="relative mr-14 sm:mr-28">
            {ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden
                className="absolute top-0 w-px bg-surface-border"
                style={{ left: percent(tick), height: `${outages.length * 2.25}rem` }}
              />
            ))}

            <ul aria-label="Outages">
              {outages.map((outage) => (
                <li
                  key={outage.start}
                  tabIndex={0}
                  aria-label={`Outage from ${formatDateTime(outage.start)} ${
                    outage.ongoing ? "still ongoing" : `to ${formatDateTime(outage.end)}`
                  }, ${formatDuration(outage.duration_hours)}, cut at ${hopLabel(outage.break_at)}`}
                  className="group relative flex h-9 items-center outline-none"
                >
                  <span
                    className={`block h-4.5 min-w-1 rounded-full bg-linear-to-r from-red-500/70 to-rose-500 shadow-[0_0_18px_-4px_rgb(239_68_68/0.8)] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 ${
                      outage.ongoing ? "shimmer" : ""
                    }`}
                    style={{ width: percent(outage.duration_hours) }}
                  />
                  <span
                    className="absolute pl-2 font-medium whitespace-nowrap text-foreground tabular-nums"
                    style={{ left: percent(outage.duration_hours) }}
                  >
                    {formatDuration(outage.duration_hours)}
                    {/* Phones keep only the duration beside the bar; the hop stays in the tooltip */}
                    <span className="hidden font-normal text-muted sm:inline"> · {hopLabel(outage.break_at)}</span>
                    {outage.ongoing && <span className="font-normal text-muted"> · ongoing</span>}
                  </span>

                  <span className="glass pointer-events-none invisible absolute bottom-full left-0 z-10 mb-1 rounded-xl px-3 py-2 shadow-xl group-hover:visible group-focus-visible:visible">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {formatDuration(outage.duration_hours)}
                      </span>
                      <span className="text-muted">
                        Cut at {hopLabel(outage.break_at)}
                        {outage.ongoing && " · ongoing"}
                      </span>
                    </span>
                    <span className="mt-0.5 block whitespace-nowrap text-muted tabular-nums">
                      {formatDateTime(outage.start)} → {outage.ongoing ? "now" : formatDateTime(outage.end)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div aria-hidden className="relative mt-1 h-5">
              {ticks.map((tick, index) => (
                <span
                  key={tick}
                  className={`absolute -translate-x-1/2 whitespace-nowrap text-muted tabular-nums ${
                    index % 2 === 1 ? "hidden sm:inline" : ""
                  }`}
                  style={{ left: percent(tick) }}
                >
                  {formatTick(tick)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {all.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="glass mt-3 rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}
