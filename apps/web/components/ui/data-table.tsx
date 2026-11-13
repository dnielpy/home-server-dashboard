import type { ReactNode } from "react";

export type Column = { label: string; align?: "right" };

export type Row = { key: string | number; cells: ReactNode[] };

/** The numbers behind a chart, folded under "View as table". The last column is the value, in bold. */
export function DataTable({ columns, rows, summary = "View as table" }: { columns: Column[]; rows: Row[]; summary?: string }) {
  return (
    <details className="group mt-5 text-sm">
      <summary className="cursor-pointer text-muted select-none transition-colors hover:text-foreground">{summary}</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-surface-border text-xs text-muted">
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={`py-2 font-medium ${column.align === "right" ? "text-right" : ""}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-surface-border last:border-0">
                {row.cells.map((cell, index) => (
                  <td
                    key={index}
                    className={`py-1.5 tabular-nums ${columns[index]?.align === "right" ? "text-right" : ""} ${
                      index === row.cells.length - 1 ? "font-medium text-foreground" : "text-muted"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
