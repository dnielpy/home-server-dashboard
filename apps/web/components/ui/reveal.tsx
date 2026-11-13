"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Fades a dashboard cell in from below, one after the other by `index`. Only on mount: the 30 second refresh keeps
 * this component, so the cards do not animate again. */
export function Reveal({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, delay: 0.06 * index, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
