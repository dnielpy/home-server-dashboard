import { BatteryGauge } from "@/components/energy/power-flow/battery-gauge";
import { buildFlowNodes } from "@/components/energy/power-flow/flow-config";
import { FlowLine } from "@/components/energy/power-flow/flow-line";
import { FlowNode } from "@/components/energy/power-flow/flow-node";
import type { Summary } from "@/lib/bluetti-api";

/** Where the power comes from and goes to right now, around the battery's charge. */
export function PowerFlow({ summary }: { summary: Summary }) {
  const nodes = buildFlowNodes(summary);

  return (
    <section aria-label="Power flow" className="@container relative aspect-square w-[min(100%,620px,calc(100dvh-14rem))]">
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden>
        {nodes.map((node) => (
          <FlowLine key={node.label} node={node} />
        ))}
      </svg>
      <BatteryGauge percent={summary.battery_percent} charging={summary.ac || summary.dc} />
      {nodes.map((node) => (
        <FlowNode key={node.label} node={node} />
      ))}
    </section>
  );
}
