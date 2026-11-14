import { PowerDonut } from "@/components/charts/power-donut";
import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { BlackoutIcon } from "@/components/icons/blackout-icon";
import { Panel } from "@/components/ui/panel";
import { ToneTile } from "@/components/ui/tone-tile";
import { getPowerTotals, type PowerTotals } from "@/lib/bluetti-api";
import { formatElapsed } from "@/lib/energy/blackout-format";
import { TIME_ZONE } from "@/lib/time-zone";

const HOUR_MS = 3_600_000;
const WINDOW_HOURS = 24;

const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short" });

/** When the power last went out, and whether it is still out. */
function lastOutage(totals: PowerTotals) {
  if (!totals.last_outage_start) return undefined;
  const start = new Date(totals.last_outage_start);
  return {
    label: "Power went out",
    value: timeFormat.format(start),
    detail: `${dayFormat.format(start)}${totals.outage_ongoing ? " · still out" : ""}`,
  };
}

function hoursValue(hours: number): string {
  return hours > 0 ? formatElapsed(hours * HOUR_MS) : "None";
}

function share(part: number, whole: number): string {
  return `${whole > 0 ? Math.round((part / whole) * 100) : 0}% of the time`;
}

/** Hours in a blackout and with power in the last 24 hours. */
export async function PowerHoursCard() {
  const { data: totals, error } = await load(() => getPowerTotals(WINDOW_HOURS));
  const outage = totals?.receiving_ac === false;

  return (
    <Panel
      id="power-hours-title"
      title="Power status"
      subtitle={totals && (totals.since ? `Last ${WINDOW_HOURS} hours` : "No readings yet")}
      Icon={BlackoutIcon}
      accent={outage ? "rose" : "emerald"}
    >
      {error !== undefined ? (
        <CardUnavailable message={error} />
      ) : totals.with_power_hours + totals.without_power_hours === 0 ? (
        <p className="text-sm text-muted">The totals will appear once the API stores readings.</p>
      ) : (
        <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-center">
          <div className="mx-auto h-36 w-36 shrink-0 sm:mx-0">
            <PowerDonut withPower={totals.with_power_hours} withoutPower={totals.without_power_hours} />
          </div>
          <div className="grid flex-1 gap-3 lg:grid-cols-2">
            <ToneTile
              tone="red"
              label="Hours in blackout"
              value={hoursValue(totals.without_power_hours)}
              detail={share(totals.without_power_hours, totals.with_power_hours + totals.without_power_hours)}
              aside={lastOutage(totals)}
              live={outage}
            />
            <ToneTile
              tone="green"
              label="Hours with power"
              value={hoursValue(totals.with_power_hours)}
              detail={share(totals.with_power_hours, totals.with_power_hours + totals.without_power_hours)}
              live={totals.receiving_ac === true}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
