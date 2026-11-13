"use client";

import { motion, useReducedMotion } from "motion/react";

import { formatClock } from "@/lib/format";

export type TimelinePeriod = { start: number; end: number; receiving_ac: boolean };

/** The day as one bar that draws from left to right: green with grid power, red in a blackout. */
export function PowerTimeline({ periods }: { periods: TimelinePeriod[] }) {
  const reduced = useReducedMotion();
  const start = periods[0].start;
  const end = periods.at(-1)!.end;
  const total = end - start;
  if (total <= 0) return null;
  const middle = start + total / 2;

  return (
    <div>
      <motion.div
        className="flex h-3.5 overflow-hidden rounded-full bg-track"
        initial={reduced ? false : { clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 1.4, ease: [0.4, 0, 0.2, 1] }}
      >
        {periods.map((period) => (
          <div
            key={period.start}
            title={`${period.receiving_ac ? "Power" : "Blackout"} ${formatClock(period.start)}–${formatClock(period.end)}`}
            className={
              period.receiving_ac
                ? "bg-linear-to-r from-emerald-500/80 to-emerald-400"
                : "bg-linear-to-r from-red-500 to-rose-500 shadow-[0_0_16px_rgb(239_68_68/0.6)]"
            }
            style={{ width: `${((period.end - period.start) / total) * 100}%` }}
          />
        ))}
      </motion.div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted tabular-nums">
        <span>{formatClock(start)}</span>
        <span>{formatClock(middle)}</span>
        <span>Now</span>
      </div>
    </div>
  );
}
