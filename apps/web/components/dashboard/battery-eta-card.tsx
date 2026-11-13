import { ClockIcon } from "@/components/icons/clock-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { Meter } from "@/components/ui/meter";
import { type Battery, getBattery } from "@/lib/api";
import { formatClock, formatElapsed } from "@/lib/format";

function estimate(battery: Battery): { value: string; detail: string } {
  if (battery.eta && battery.hours_left !== null) {
    const value = formatElapsed(battery.hours_left * 3_600_000);
    return battery.eta_kind === "full"
      ? { value, detail: `Full at ${formatClock(battery.eta)}` }
      : { value, detail: `Reaches ${battery.reserve_percent}% at ${formatClock(battery.eta)}` };
  }
  switch (battery.state) {
    case "full":
      return { value: "Charged", detail: "Nothing to wait for" };
    case "charging":
      return { value: "—", detail: "Measuring the charge rate" };
    case "discharging":
      return { value: "—", detail: "At the reserve level" };
    case "idle":
      return { value: "48 h+", detail: "The load barely drains it" };
    default:
      return { value: "—", detail: "No recent readings" };
  }
}

/** How far the battery is along the way it is going: to 100 % while charging, down to the reserve while draining. */
function progress(battery: Battery): number | null {
  if (battery.soc === null) return null;
  if (battery.eta_kind === "full") return battery.soc;
  const usable = 100 - battery.reserve_percent;
  return usable > 0 ? ((battery.soc - battery.reserve_percent) / usable) * 100 : null;
}

/** When the battery runs down to the reserve level, or fills up while it charges. */
export async function BatteryEtaCard() {
  const { data, error } = await load(getBattery);
  const charging = data?.eta_kind === "full";
  const title = charging ? "Until full" : "Until empty";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={ClockIcon} accent="amber">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const { value, detail } = estimate(data);
  const left = progress(data);
  return (
    <Card
      title={title}
      Icon={ClockIcon}
      accent={charging ? "amber" : "violet"}
      footer={data.load_w === null ? undefined : `${Math.round(data.load_w)} W load right now`}
    >
      <div className="flex flex-1 flex-col justify-end gap-3">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-foreground tabular-nums 2xl:text-4xl">{value}</p>
          <p className="mt-1 text-sm text-muted tabular-nums">{detail}</p>
        </div>
        {left !== null && <Meter percent={left} active={data.eta !== null} className="h-2" />}
      </div>
    </Card>
  );
}
