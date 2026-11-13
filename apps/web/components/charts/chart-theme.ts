// Recharts draws with SVG attributes, which cannot read CSS variables, so the colors are spelled out here
export const COLORS = {
  emerald: "#10b981",
  amber: "#f59e0b",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  red: "#ef4444",
};

/** Quiet axes: muted labels (the chart's wrapper sets the color), no lines or ticks. */
export const AXIS = {
  tick: { fill: "currentColor", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;
