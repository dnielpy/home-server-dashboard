"use client";

import { motion } from "motion/react";

type MeterProps = {
  /** 0 to 100. */
  percent: number;
  /** Tailwind classes for the filled part; the card's accent gradient when left out. */
  barClassName?: string;
  /** A light sweeps over the bar, for something still in progress. */
  active?: boolean;
  className?: string;
  delay?: number;
};

/** A horizontal bar that grows to its value. */
export function Meter({ percent, barClassName, active, className = "h-1.5", delay = 0 }: MeterProps) {
  return (
    <div className={`overflow-hidden rounded-full bg-track ${className}`}>
      <motion.div
        className={`h-full rounded-full ${barClassName ?? "bg-accent-gradient"} ${active ? "shimmer" : ""}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        transition={{ duration: 1, delay, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  );
}
