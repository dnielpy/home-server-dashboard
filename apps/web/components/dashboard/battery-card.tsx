import { BatteryIcon } from "@/components/icons/battery-icon";
import { BoltIcon } from "@/components/icons/bolt-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { type BatteryState, getBattery } from "@/lib/api";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STATES: Record<BatteryState, { label: string; ring: string; text: string }> = {
  full: { label: "Charged", ring: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  charging: { label: "Charging", ring: "stroke-amber-400", text: "text-amber-600 dark:text-amber-400" },
  discharging: { label: "Discharging", ring: "stroke-red-500", text: "text-red-600 dark:text-red-400" },
  idle: { label: "Not charging", ring: "stroke-zinc-400", text: "text-zinc-500 dark:text-zinc-400" },
  unknown: { label: "No recent readings", ring: "stroke-zinc-400", text: "text-zinc-500 dark:text-zinc-400" },
};

function Ring({ percent, state }: { percent: number; state: BatteryState }) {
  const Icon = state === "charging" ? BoltIcon : BatteryIcon;
  return (
    <div className="relative h-20 w-20 xl:h-28 xl:w-28">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="9" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          className={`${STATES[state].ring} transition-[stroke-dasharray] duration-700`}
        />
      </svg>
      <Icon className={`absolute inset-0 m-auto h-7 w-7 xl:h-10 xl:w-10 ${STATES[state].text}`} />
    </div>
  );
}

/** The Bluetti's charge as a ring: green when charged, yellow while charging, red while discharging. */
export async function BatteryCard() {
  const { data, error } = await load(getBattery);
  if (error !== undefined) {
    return (
      <Card title="Bluetti" Icon={BatteryIcon}>
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const percent = data.soc ?? 0;
  const style = STATES[data.state];
  return (
    <Card title="Bluetti" Icon={BatteryIcon}>
      <div className="flex flex-1 flex-col justify-between gap-4">
        <Ring percent={percent} state={data.state} />
        <div>
          <p className="text-5xl font-light xl:text-6xl tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
            {data.soc === null ? "—" : `${data.soc}%`}
          </p>
          <p className={`mt-1 text-sm font-medium ${style.text}`}>{style.label}</p>
        </div>
      </div>
    </Card>
  );
}
