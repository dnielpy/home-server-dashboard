"use client";

import { Card, CardSkeleton, CardUnavailable } from "@/components/dashboard/card";
import { useSystem } from "@/components/dashboard/system-live";
import { UsageMeter } from "@/components/dashboard/usage";
import { ServerIcon } from "@/components/icons/server-icon";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { formatBytes } from "@/lib/format";

/** The server's memory in use, out of all it has. */
export function MemoryCard() {
  const { data, error } = useSystem();
  const memory = data?.memory;
  if (!memory) {
    if (!data && !error) return <CardSkeleton />;
    return (
      <Card title="Memory" Icon={ServerIcon} accent="violet">
        <CardUnavailable message={data ? "The agent cannot read the memory of this machine." : error!} />
      </Card>
    );
  }

  return (
    <Card title="Memory" Icon={ServerIcon} accent="violet" footer={`${formatBytes(memory.available_bytes)} available`}>
      <div className="flex flex-1 flex-col justify-end gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-4xl font-semibold tracking-tight text-foreground xl:text-5xl">
            <AnimatedNumber value={memory.percent} />
            <span className="ml-1 text-base font-medium text-muted xl:text-xl">%</span>
          </p>
          <p className="pb-1 text-sm text-muted tabular-nums">
            {formatBytes(memory.used_bytes)} of {formatBytes(memory.total_bytes)}
          </p>
        </div>
        <UsageMeter percent={memory.percent} />
      </div>
    </Card>
  );
}
