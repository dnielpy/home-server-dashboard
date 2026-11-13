import { RadialGauge } from "@/components/charts/radial-gauge";
import { AcOutletIcon } from "@/components/icons/ac-outlet-icon";
import { GaugeIcon } from "@/components/icons/gauge-icon";
import { type Accent, Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { type Battery, getBattery } from "@/lib/api";
import { formatElapsed } from "@/lib/format";

/** The AC180's inverter rating, the top of the ring */
const MAX_LOAD_W = 1800;

// Yellow, turning orange from a third of the inverter and red from two thirds
const LEVELS: { below: number; accent: Accent; from: string; to: string }[] = [
  { below: 600, accent: "amber", from: "#fef08a", to: "#facc15" },
  { below: 1200, accent: "amber", from: "#fde047", to: "#f97316" },
  { below: Infinity, accent: "rose", from: "#fb923c", to: "#ef4444" },
];

/** How long the battery lasts at this load, or until it is full while it charges. */
function runtime(battery: Battery): string {
  if (battery.eta && battery.hours_left !== null) {
    const left = formatElapsed(battery.hours_left * 3_600_000);
    return battery.eta_kind === "full" ? `Full in ${left}` : `${left} until ${battery.reserve_percent}%`;
  }
  switch (battery.state) {
    case "full":
      return "Battery charged";
    case "idle":
      return "48 h+ at this load";
    default:
      return "No estimate yet";
  }
}

/** The watts the Bluetti is feeding right now, as a ring that fills up to what its inverter can give. */
export async function LoadCard() {
  const { data, error } = await load(getBattery);
  if (error !== undefined) {
    return (
      <Card title="Load" Icon={GaugeIcon} accent="amber">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const watts = data.load_w === null ? null : Math.round(data.load_w);
  const level = LEVELS.find((candidate) => (watts ?? 0) < candidate.below)!;
  return (
    <Card title="Load" Icon={GaugeIcon} accent={level.accent}>
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <RadialGauge
          percent={((watts ?? 0) / MAX_LOAD_W) * 100}
          from={level.from}
          to={level.to}
          charging={false}
          icon={<AcOutletIcon className="h-5 w-5" />}
        >
          <p className="text-4xl font-light tracking-tight text-foreground xl:text-5xl">
            {watts === null ? "—" : <AnimatedNumber value={watts} />}
            {watts !== null && <span className="ml-0.5 text-xl text-muted xl:text-2xl">W</span>}
          </p>
        </RadialGauge>
        <p className="text-sm font-medium text-muted tabular-nums">{runtime(data)}</p>
      </div>
    </Card>
  );
}
