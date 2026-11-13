import { BatteryAreaChart } from "@/components/charts/battery-area-chart";
import { COLORS } from "@/components/charts/chart-theme";
import { BoltIcon } from "@/components/icons/bolt-icon";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { getBatteryHistory, getPower } from "@/lib/api";

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={`h-0.5 w-3 rounded-full ${dashed ? "opacity-70" : ""}`}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

/** The battery percentage and the load over the last 24 hours, with the blackouts behind them. */
export async function BatteryHistoryCard() {
  const [history, power] = await Promise.all([load(getBatteryHistory), load(getPower)]);
  const title = "Battery · last 24 h";
  if (history.error !== undefined) {
    return (
      <Card title={title} Icon={BoltIcon} accent="emerald">
        <CardUnavailable message={history.error} />
      </Card>
    );
  }

  const points = history.data.points.map((point) => ({ ...point, at: Date.parse(point.at) }));
  // Without the power periods the curve still shows, only without the blackout bands
  const blackouts = (power.data?.periods ?? [])
    .filter((period) => !period.receiving_ac)
    .map((period) => ({ start: Date.parse(period.start), end: Date.parse(period.end) }));

  return (
    <Card
      title={title}
      Icon={BoltIcon}
      accent="emerald"
      badge={
        <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
          <Legend color={COLORS.emerald} label="Battery" />
          <Legend color={COLORS.amber} label="Load" dashed />
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-red-500/25" />
            Blackout
          </span>
        </div>
      }
    >
      {points.length < 2 ? (
        <p className="text-sm text-muted">No readings in the last 24 hours.</p>
      ) : (
        <BatteryAreaChart points={points} blackouts={blackouts} />
      )}
    </Card>
  );
}
