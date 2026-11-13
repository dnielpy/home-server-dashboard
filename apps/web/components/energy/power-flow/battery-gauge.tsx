import { BatteryIcon } from "@/components/icons/battery-icon";
import { CometTrail } from "@/components/ui/comet-trail";

const GAUGE_ARC = "M149.09 250.91 A72 72 0 1 1 250.91 250.91";
const CENTER = 200;
const RADIUS = 72;
const START_ANGLE = 135;
const SWEEP_ANGLE = 270;

type GaugeState = "discharging" | "charging" | "full";

// The same colors as the Bluetti card of the dashboard
const STATE_STYLES: Record<GaugeState, { from: string; to: string; comet: string; text: string }> = {
  discharging: { from: "#fb923c", to: "#ef4444", comet: "#fca5a5", text: "text-red-500" },
  charging: { from: "#fde047", to: "#f59e0b", comet: "#fde68a", text: "text-amber-500" },
  full: { from: "#22d3ee", to: "#10b981", comet: "#6ee7b7", text: "text-emerald-500" },
};

function gaugeState(level: number, charging: boolean): GaugeState {
  if (!charging) return "discharging";
  return level >= 100 ? "full" : "charging";
}

function filledArc(level: number): string {
  const sweep = (SWEEP_ANGLE * level) / 100;
  const point = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return `${(CENTER + RADIUS * Math.cos(radians)).toFixed(2)} ${(CENTER + RADIUS * Math.sin(radians)).toFixed(2)}`;
  };
  return `M${point(START_ANGLE)} A${RADIUS} ${RADIUS} 0 ${sweep > 180 ? 1 : 0} 1 ${point(START_ANGLE + sweep)}`;
}

export function BatteryGauge({ percent, charging }: { percent: number; charging: boolean }) {
  const level = Math.max(0, Math.min(100, percent));
  const style = STATE_STYLES[gaugeState(level, charging)];

  return (
    <>
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="flow-gauge-stroke" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={style.from} />
            <stop offset="100%" stopColor={style.to} />
          </linearGradient>
          <filter id="flow-gauge-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>
        <path d={GAUGE_ARC} fill="none" strokeWidth={14} strokeLinecap="round" className="stroke-track" />
        {/* The same arc blurred underneath gives it its glow */}
        {[true, false].map((glow) => (
          <path
            key={String(glow)}
            d={GAUGE_ARC}
            fill="none"
            stroke="url(#flow-gauge-stroke)"
            strokeWidth={14}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${level} 100`}
            filter={glow ? "url(#flow-gauge-glow)" : undefined}
            opacity={glow ? 0.55 : 1}
            className="transition-[stroke-dasharray] duration-700"
          />
        ))}
        {level > 0 && (
          <CometTrail
            path={filledArc(level)}
            color={style.comet}
            glow={style.to}
            size={1.6}
            durationSeconds={4}
            tailLength={0.25}
          />
        )}
      </svg>
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <BatteryIcon className={`h-[6cqw] w-[6cqw] ${style.text}`} />
        <p className="mt-1 text-[length:6.5cqw] leading-none font-light tracking-tight text-foreground tabular-nums">
          {level}
          <span className="ml-0.5 text-[length:2.6cqw] font-medium text-muted">%</span>
        </p>
      </div>
    </>
  );
}
