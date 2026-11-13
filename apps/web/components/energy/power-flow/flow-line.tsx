import { ACTIVE_STYLES, type FlowNodeData } from "@/components/energy/power-flow/flow-config";

export function FlowLine({ node }: { node: FlowNodeData }) {
  return (
    <g>
      <path d={node.path} fill="none" strokeWidth={14} strokeLinecap="round" className="stroke-track" />
      {node.watts > 0 && (
        <path
          d={node.path}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray="16 28"
          className={`flow-line ${node.direction === "out" ? "flow-line-out" : ""} ${ACTIVE_STYLES[node.direction].stroke}`}
        />
      )}
    </g>
  );
}
