import { BlackoutIcon } from "@/components/icons/blackout-icon";
import { Badge, Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { getPower, type Power, type PowerPeriod } from "@/lib/api";
import { formatClock, formatHours } from "@/lib/format";

function share(part: number, whole: number): string {
  return `${whole > 0 ? Math.round((part / whole) * 100) : 0}% of the time`;
}

/** The last 24 hours as a bar: green with grid power, red in a blackout. */
function Timeline({ periods }: { periods: PowerPeriod[] }) {
  const start = Date.parse(periods[0].start);
  const end = Date.parse(periods.at(-1)!.end);
  const total = end - start;
  if (total <= 0) return null;

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {periods.map((period) => {
          const width = ((Date.parse(period.end) - Date.parse(period.start)) / total) * 100;
          return (
            <div
              key={period.start}
              title={`${period.receiving_ac ? "Power" : "Blackout"} ${formatClock(period.start)}–${formatClock(period.end)}`}
              className={period.receiving_ac ? "bg-emerald-500" : "bg-red-500"}
              style={{ width: `${width}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
        <span>{formatClock(start)}</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function badge(power: Power) {
  if (power.receiving_ac === null) return undefined;
  return power.outage_ongoing || !power.receiving_ac ? (
    <Badge tone="red">Blackout now</Badge>
  ) : (
    <Badge tone="green">Power on</Badge>
  );
}

/** Hours with and without grid power in the last 24 hours. */
export async function PowerCard() {
  const { data, error } = await load(getPower);
  const title = "Power · last 24 h";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={BlackoutIcon}>
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const recorded = data.with_power_hours + data.without_power_hours;
  return (
    <Card title={title} Icon={BlackoutIcon} badge={badge(data)}>
      {recorded === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No readings in the last 24 hours.</p>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
                Blackout
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                {formatHours(data.without_power_hours)}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{share(data.without_power_hours, recorded)}</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
                With power
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                {formatHours(data.with_power_hours)}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{share(data.with_power_hours, recorded)}</p>
            </div>
          </div>
          {data.periods.length > 0 && <Timeline periods={data.periods} />}
        </div>
      )}
    </Card>
  );
}
