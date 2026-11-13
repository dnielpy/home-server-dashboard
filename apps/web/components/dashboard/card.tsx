import type { ComponentType, ReactNode } from "react";

import type { IconProps } from "@/components/icons/icon-props";

export type Accent = "emerald" | "amber" | "sky" | "violet" | "rose";

// Written out so Tailwind keeps them
export const ACCENTS: Record<Accent, string> = {
  emerald: "accent-emerald",
  amber: "accent-amber",
  sky: "accent-sky",
  violet: "accent-violet",
  rose: "accent-rose",
};

type CardProps = {
  title: string;
  Icon: ComponentType<IconProps>;
  /** The color of the card's glow, icon and bars. */
  accent: Accent;
  /** Shown on the right of the header, e.g. a live badge. */
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function Card({ title, Icon, accent, badge, footer, children }: CardProps) {
  return (
    <section
      className={`glass glass-glow ${ACCENTS[accent]} flex h-full min-h-44 flex-col rounded-3xl p-5 hover:-translate-y-0.5 xl:p-6`}
    >
      <header className="flex items-center gap-2.5 text-sm font-medium text-muted">
        <span className="bg-accent-soft text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="truncate">{title}</h3>
        {badge && <div className="ml-auto shrink-0">{badge}</div>}
      </header>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
      {footer && <div className="mt-4 border-t border-surface-border pt-3 text-xs text-muted">{footer}</div>}
    </section>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass flex h-full min-h-44 flex-col gap-4 rounded-3xl p-5 xl:p-6">
      <div className="shimmer h-7 w-32 rounded-lg bg-track" />
      <div className="shimmer mt-auto h-10 w-2/3 rounded-xl bg-track" />
      <div className="shimmer h-3 w-1/2 rounded-full bg-track" />
    </div>
  );
}

/** The card's data could not be loaded; the rest of the dashboard keeps working. */
export function CardUnavailable({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-1">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <span aria-hidden className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_12px_rgb(239_68_68)]" />
        Unavailable
      </p>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

const TONES = {
  green: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  red: "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400",
  amber: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  sky: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400",
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  zinc: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-300",
};

/** A small pill; `live` adds a pulsing dot for values that are happening right now. */
export function Badge({ tone, live, children }: { tone: keyof typeof TONES; live?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {live && <span aria-hidden className="pulse-dot h-1.5 w-1.5" />}
      {children}
    </span>
  );
}
