import type { ReactNode } from "react";

/** The box every chart shows on hover: a label and one row per value. */
export function ChartTooltip({ label, rows }: { label: ReactNode; rows: { color: string; name: string; value: string }[] }) {
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2 text-muted">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: row.color }} />
          {row.name}
          <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">{row.value}</span>
        </p>
      ))}
    </div>
  );
}
