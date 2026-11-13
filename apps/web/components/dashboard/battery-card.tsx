import { RadialGauge } from "@/components/charts/radial-gauge";
import { BatteryIcon } from "@/components/icons/battery-icon";
import { type Accent, Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { type BatteryState, getBattery } from "@/lib/api";

const STATES: Record<BatteryState, { label: string; accent: Accent; from: string; to: string; text: string }> = {
  full: { label: "Charged", accent: "emerald", from: "#22d3ee", to: "#10b981", text: "text-emerald-600 dark:text-emerald-400" },
  charging: { label: "Charging", accent: "amber", from: "#fde047", to: "#f59e0b", text: "text-amber-600 dark:text-amber-400" },
  discharging: { label: "Discharging", accent: "rose", from: "#fb923c", to: "#ef4444", text: "text-red-600 dark:text-red-400" },
  idle: { label: "Not charging", accent: "sky", from: "#94a3b8", to: "#64748b", text: "text-muted" },
  unknown: { label: "No recent readings", accent: "sky", from: "#94a3b8", to: "#64748b", text: "text-muted" },
};

/** The Bluetti's charge as a glowing ring: green when charged, yellow while charging, red while discharging. */
export async function BatteryCard() {
  const { data, error } = await load(getBattery);
  if (error !== undefined) {
    return (
      <Card title="Bluetti" Icon={BatteryIcon} accent="emerald">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const style = STATES[data.state];
  return (
    <Card title="Bluetti" Icon={BatteryIcon} accent={style.accent}>
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <RadialGauge percent={data.soc ?? 0} from={style.from} to={style.to} charging={data.state === "charging"}>
          <p className="text-4xl font-light tracking-tight text-foreground xl:text-5xl">
            {data.soc === null ? "—" : <AnimatedNumber value={data.soc} />}
            {data.soc !== null && <span className="ml-0.5 text-xl text-muted xl:text-2xl">%</span>}
          </p>
        </RadialGauge>
        <p className={`text-sm font-medium ${style.text}`}>{style.label}</p>
      </div>
    </Card>
  );
}
