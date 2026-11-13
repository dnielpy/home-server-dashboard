import { ACTIVE_STYLES, CORNER_POSITION, type FlowNodeData } from "@/components/energy/power-flow/flow-config";

export function FlowNode({ node }: { node: FlowNodeData }) {
  const active = node.watts > 0;
  const position = CORNER_POSITION[node.corner];

  return (
    <>
      <div
        className={`absolute flex h-[max(13%,52px)] w-[max(13%,52px)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl ring-8 transition-colors ${position.node} ${
          active ? `${ACTIVE_STYLES[node.direction].circle} text-white` : "glass text-muted ring-transparent"
        }`}
      >
        <node.Icon className="h-1/2 w-1/2" />
      </div>
      <div className={`absolute flex -translate-y-1/2 flex-col ${position.text}`}>
        <p className="text-[length:max(16px,3.8cqw)] leading-tight font-semibold text-foreground tabular-nums">
          {node.watts}
          <span className="ml-0.5 text-[length:max(11px,2.3cqw)] font-medium text-muted">W</span>
        </p>
        <p className="text-[length:max(12px,2.6cqw)] text-muted">{node.label}</p>
      </div>
    </>
  );
}
