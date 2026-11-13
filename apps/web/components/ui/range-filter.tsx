import Link from "next/link";

export type RangeOption = { hours: number; label: string; description: string };

type RangeFilterProps = {
  label: string;
  param: string;
  ranges: RangeOption[];
  selected: RangeOption;
  searchParams: Record<string, string | string[] | undefined>;
  /** The page the links stay on. */
  path: string;
};

function hrefFor(path: string, param: string, hours: number, searchParams: RangeFilterProps["searchParams"]): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set(param, String(hours));
  return `${path}?${query.toString()}`;
}

/** The time ranges of a panel as a row of pills; the selected one lit in the panel's accent. */
export function RangeFilter({ label, param, ranges, selected, searchParams, path }: RangeFilterProps) {
  return (
    <nav aria-label={label} className="inline-flex self-start rounded-xl bg-track p-1">
      {ranges.map((range) => {
        const active = range.hours === selected.hours;
        return (
          <Link
            key={range.hours}
            href={hrefFor(path, param, range.hours, searchParams)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            title={range.description}
            className={`rounded-lg px-3 py-1 text-sm font-medium tabular-nums transition-colors ${
              active
                ? "bg-accent-soft text-accent shadow-sm ring-1 ring-current/20 ring-inset"
                : "text-muted hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            {range.label}
          </Link>
        );
      })}
    </nav>
  );
}
