import type { Column, Row } from "@/components/ui/data-table";
import { buildAverageRows, type Sample } from "@/lib/energy/time-series";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** The averages of a chart, in 12 slices of its range, as the columns and rows of its table. */
export function averageRows(
  samples: Sample[],
  hours: number,
  now: number,
  valueLabel: string,
  unit: string,
): { columns: Column[]; rows: Row[] } {
  return {
    columns: [{ label: "From" }, { label: "To" }, { label: valueLabel, align: "right" }],
    rows: buildAverageRows(samples, hours, now).map((row) => ({
      key: row.start,
      cells: [timeFormat.format(row.start), timeFormat.format(row.end), `${row.value}${unit}`],
    })),
  };
}
