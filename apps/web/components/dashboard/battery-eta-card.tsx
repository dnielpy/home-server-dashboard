import { ClockIcon } from "@/components/icons/clock-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
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

/** When the battery runs down to the reserve level, or fills up while it charges. */
export async function BatteryEtaCard() {
  const { data, error } = await load(getBattery);
  const title = data?.eta_kind === "full" ? "Until full" : "Until empty";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={ClockIcon}>
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const { value, detail } = estimate(data);
  return (
    <Card
      title={title}
      Icon={ClockIcon}
      footer={data.load_w === null ? undefined : `${Math.round(data.load_w)} W load right now`}
    >
      <div className="flex flex-1 flex-col justify-end">
        <p className="text-3xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">{value}</p>
        <p className="mt-1 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">{detail}</p>
      </div>
    </Card>
  );
}
