"use client";

import { Card, CardSkeleton, CardUnavailable } from "@/components/dashboard/card";
import { useSystem } from "@/components/dashboard/system-live";
import { UsageMeter } from "@/components/dashboard/usage";
import { GaugeIcon } from "@/components/icons/gauge-icon";
import { AnimatedNumber } from "@/components/ui/animated-number";

/** How busy the server's processor was in the last second. */
export function CpuCard() {
  const { data, error } = useSystem();
  if (!data) {
    if (!error) return <CardSkeleton />;
    return (
      <Card title="CPU" Icon={GaugeIcon} accent="amber">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const percent = data.cpu_percent;
  return (
    <Card title="CPU" Icon={GaugeIcon} accent="amber">
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
