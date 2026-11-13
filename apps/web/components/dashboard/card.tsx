import type { ComponentType, ReactNode } from "react";

import type { IconProps } from "@/components/icons/icon-props";

type CardProps = {
  title: string;
  Icon: ComponentType<IconProps>;
  /** Shown on the right of the header, e.g. a live badge. */
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function Card({ title, Icon, badge, footer, children }: CardProps) {
  return (
    <section className="flex h-full min-h-40 flex-col rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
        <Icon className="h-4 w-4 shrink-0" />
        <h2 className="truncate">{title}</h2>
        {badge && <div className="ml-auto shrink-0">{badge}</div>}
      </header>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
      {footer && <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{footer}</p>}
    </section>
  );
}

export function CardSkeleton() {
  return (
    <div className="h-full min-h-40 animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
  );
}

/** The card's data could not be loaded; the rest of the dashboard keeps working. */
export function CardUnavailable({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-1">
      <p className="font-medium text-zinc-900 dark:text-zinc-50">Unavailable</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
    </div>
  );
}

export function Badge({ tone, children }: { tone: "green" | "red" | "amber" | "zinc"; children: ReactNode }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
