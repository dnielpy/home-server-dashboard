import { COLORS } from "@/components/charts/chart-theme";

// The dashboard's colors: green online, red offline, amber while a hop is pinged
export const STATUS_COLORS = {
  online: COLORS.emerald,
  offline: COLORS.red,
  passing: COLORS.amber,
  noData: "#64748b",
};

// Download and upload as the dashboard's bandwidth card draws them
export const SERIES_COLORS = {
  download: COLORS.sky,
  upload: COLORS.violet,
};
