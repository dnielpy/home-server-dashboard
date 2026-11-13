import { Card, CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { UsageMeter } from "@/components/dashboard/usage";
import { ServerIcon } from "@/components/icons/server-icon";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { getSystem } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/** The server's memory in use, out of all it has. */
export async function MemoryCard() {
  const { data, error } = await load(getSystem);
  if (error !== undefined) {
    return (
      <Card title="Memory" Icon={ServerIcon} accent="violet">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  const { memory } = data;
  if (memory === null) {
    return (
      <Card title="Memory" Icon={ServerIcon} accent="violet">
        <CardUnavailable message="The agent cannot read the memory of this machine." />
      </Card>
    );
  }

  return (
    <Card
      title="Memory"
      Icon={ServerIcon}
      accent="violet"
      footer={`${formatBytes(memory.available_bytes)} available`}
    >
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
