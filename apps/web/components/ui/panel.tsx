import type { ComponentType, ReactNode } from "react";

import { type Accent, ACCENTS } from "@/components/dashboard/card";
import type { IconProps } from "@/components/icons/icon-props";

type PanelProps = {
  id: string;
  title: string;
  subtitle?: ReactNode;
  Icon: ComponentType<IconProps>;
  accent: Accent;
  /** Shown on the right of the header, e.g. a range filter. */
  actions?: ReactNode;
  children: ReactNode;
};

/** A wide card of the app pages: the dashboard's glass card with a subtitle and room for filters. */
export function Panel({ id, title, subtitle, Icon, accent, actions, children }: PanelProps) {
  return (
    <section
      aria-labelledby={id}
      className={`glass glass-glow ${ACCENTS[accent]} flex w-full min-w-0 flex-col rounded-3xl p-5 xl:p-6`}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-accent-soft text-accent mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 id={id} className="font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-muted tabular-nums">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function PanelSkeleton({ height }: { height: number }) {
  return (
    <div className="glass flex w-full flex-col gap-4 rounded-3xl p-5 xl:p-6" style={{ height }}>
      <div className="flex items-center gap-3">
        <div className="shimmer h-8 w-8 rounded-xl bg-track" />
        <div className="shimmer h-4 w-40 rounded-full bg-track" />
      </div>
      <div className="shimmer flex-1 rounded-2xl bg-track" />
    </div>
  );
}

/** What a panel shows in a period without data. */
export function PanelEmpty({ height, children }: { height: number; children: ReactNode }) {
  return (
    <p
      className="flex items-center justify-center rounded-2xl border border-dashed border-surface-border text-sm text-muted"
      style={{ height }}
    >
      {children}
    </p>
  );
}
