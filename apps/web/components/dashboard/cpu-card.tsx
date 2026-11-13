import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { UsageMeter } from "@/components/dashboard/usage";
import { GaugeIcon } from "@/components/icons/gauge-icon";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { getSystem } from "@/lib/api";
import { formatClock } from "@/lib/format";

/** How busy the server's processor is right now. */
export async function CpuCard() {
  const { data, error } = await load(getSystem);
  if (error !== undefined) {
    return (
      <Card title="CPU" Icon={GaugeIcon} accent="amber">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const percent = data.cpu_percent;
  return (
    <Card title="CPU" Icon={GaugeIcon} accent="amber" footer={`Read at ${formatClock(data.updated_at)}`}>
      <div className="flex flex-1 flex-col justify-end gap-3">
        <p className="text-4xl font-semibold tracking-tight text-foreground xl:text-5xl">
          {percent === null ? "—" : <AnimatedNumber value={percent} digits={percent < 10 ? 1 : 0} />}
          {percent !== null && <span className="ml-1 text-base font-medium text-muted xl:text-xl">%</span>}
        </p>
        <UsageMeter percent={percent ?? 0} />
      </div>
    </Card>
  );
}
