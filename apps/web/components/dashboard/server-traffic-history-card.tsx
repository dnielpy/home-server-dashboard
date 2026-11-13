import { TrafficAreaChart } from "@/components/charts/traffic-area-chart";
import { COLORS } from "@/components/charts/chart-theme";
import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { getSystemTraffic } from "@/lib/api";

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** The server's network speed over the last 7 days, averaged every 15 minutes. */
export async function ServerTrafficHistoryCard() {
  const { data, error } = await load(getSystemTraffic);
  const title = "Server network · last 7 days";
  if (error !== undefined) {
    return (
      <Card title={title} Icon={TrafficIcon} accent="sky">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const points = data.points.map((point) => ({
    at: Date.parse(point.at),
    rx: point.rx_bytes_per_second,
    tx: point.tx_bytes_per_second,
  }));
  return (
    <Card
      title={title}
      Icon={TrafficIcon}
      accent="sky"
      badge={
        <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
          <Legend color={COLORS.sky} label="Download" />
          <Legend color={COLORS.violet} label="Upload" />
        </div>
      }
    >
      {points.length < 2 ? (
        <p className="text-sm text-muted">No readings in the last 7 days.</p>
      ) : (
        <TrafficAreaChart points={points} />
      )}
    </Card>
  );
}
