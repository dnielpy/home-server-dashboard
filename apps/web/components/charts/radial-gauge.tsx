"use client";

import { motion } from "motion/react";
import { type ReactNode, useId } from "react";

import { BatteryIcon } from "@/components/icons/battery-icon";
import { BoltIcon } from "@/components/icons/bolt-icon";

const RADIUS = 42;

/**
 * A ring that fills to `percent`, lit in `from` → `to`, with `icon` and `children` in its middle. The icon is the
 * battery's (a bolt while `charging`) unless one is given; `charging` also makes it pulse.
 */
export function RadialGauge({
  percent,
  from,
  to,
  charging,
  icon,
  children,
}: {
  percent: number;
  from: string;
  to: string;
  charging: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const Icon = charging ? BoltIcon : BatteryIcon;
  // Each gauge on the page needs its own gradient and glow
  const id = useId();
  return (
    <div className="relative aspect-square w-full max-w-52">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" className="stroke-track" />
        {/* The same arc blurred underneath gives it its glow */}
        {[true, false].map((glow) => (
          <motion.circle
            key={String(glow)}
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke={`url(#${id}-stroke)`}
            strokeWidth="8"
            strokeLinecap="round"
            filter={glow ? `url(#${id}-glow)` : undefined}
            opacity={glow ? 0.55 : 1}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: Math.min(1, Math.max(0.001, percent / 100)) }}
            transition={{ duration: 1.6, ease: [0.2, 0.8, 0.2, 1] }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          style={{ color: to }}
          animate={charging ? { scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] } : undefined}
          transition={charging ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : undefined}
        >
          {icon ?? <Icon className="h-5 w-5" />}
        </motion.span>
        {children}
      </div>
    </div>
  );
}
