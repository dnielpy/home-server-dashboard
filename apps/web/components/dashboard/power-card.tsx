import { PowerDonut } from "@/components/charts/power-donut";
import { BlackoutIcon } from "@/components/icons/blackout-icon";
import { Badge, Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { getPower, type Power } from "@/lib/api";
import { formatHours } from "@/lib/format";

function badge(power: Power) {
  if (power.receiving_ac === null) return undefined;
  return power.outage_ongoing || !power.receiving_ac ? (
    <Badge tone="red" live>
      Blackout now
    </Badge>
  ) : (
    <Badge tone="green" live>
      Power on
    </Badge>
  );
}

function Stat({ dot, label, hours }: { dot: string; label: string; hours: number }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm text-muted">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-4xl xl:text-5xl">
        {formatHours(hours)}
      </p>
    </div>
  );
}

/** Hours with and without grid power in the last 24 hours. */
export async function PowerCard() {
  const { data, error } = await load(getPower);
  const title = "Power · last 24 h";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={BlackoutIcon} accent="emerald">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const recorded = data.with_power_hours + data.without_power_hours;
  return (
    <Card
      title={title}
      Icon={BlackoutIcon}
      accent={data.outage_ongoing ? "rose" : "emerald"}
      badge={badge(data)}
    >
      {recorded === 0 ? (
        <p className="text-sm text-muted">No readings in the last 24 hours.</p>
      ) : (
        <div className="grid flex-1 grid-cols-2 items-center gap-4 sm:gap-6">
          <div className="flex justify-center">
            <PowerDonut
              withPower={data.with_power_hours}
              withoutPower={data.without_power_hours}
              className="w-full max-w-52"
            />
          </div>
          <div className="flex flex-col gap-6">
            <Stat
              dot="bg-emerald-500 shadow-[0_0_10px_rgb(16_185_129)]"
              label="With power"
              hours={data.with_power_hours}
            />
            <Stat dot="bg-red-500 shadow-[0_0_10px_rgb(239_68_68)]" label="Blackout" hours={data.without_power_hours} />
          </div>
        </div>
      )}
    </Card>
  );
}
