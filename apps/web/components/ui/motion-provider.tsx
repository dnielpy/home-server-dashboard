"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Motion follows the system's reduce motion setting everywhere. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
