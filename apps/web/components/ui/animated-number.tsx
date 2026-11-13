"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

/** A number that counts up from 0 when it appears and glides to each new value after that. */
export function AnimatedNumber({ value, digits = 0, className }: { value: number; digits?: number; className?: string }) {
  const reduced = useReducedMotion();
  const spring = useSpring(0, { stiffness: 70, damping: 20, mass: 0.8 });
  const text = useTransform(spring, (current) =>
    current.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  );

  useEffect(() => {
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [spring, value, reduced]);

  return <motion.span className={`tabular-nums ${className ?? ""}`}>{text}</motion.span>;
}
