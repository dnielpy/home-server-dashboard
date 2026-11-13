import { connection } from "next/server";

import { SourceUnavailableError } from "@/lib/api";

// The Energy pages read the Bluetti API straight from this server, as its own web app did

function apiUrl(path: string): string {
  const base = process.env.BLUETTI_API_URL ?? "http://localhost:3001";
  return new URL(path, base).toString();
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { cache: "no-store" });
  } catch (error) {
    throw new SourceUnavailableError("bluetti", "Could not reach the Bluetti API", { cause: error });
  }

  if (!response.ok) {
    throw new SourceUnavailableError("bluetti", `The Bluetti API responded with ${response.status}`);
  }

  return response.json();
}

export type Summary = {
  id: number;
  date: string;
  battery_percent: number;
  ac_output: number;
  ac_input: number;
  dc_output: number;
  dc_input: number;
  ac: boolean;
  dc: boolean;
};

type SummaryPage = {
  items: Summary[];
  total: number;
  page_size: number;
  offset: number;
};

export async function getLatestSummary(): Promise<Summary | null> {
  await connection();
  const page = await getJson<SummaryPage>("/data-summary?page_size=1");
  return page.items[0] ?? null;
}

export type BatteryStatusPoint = {
  date: string;
  battery_percent: number;
};

export type BatteryStatus = {
  readings: BatteryStatusPoint[];
  fetchedAt: number;
};

export async function getBatteryStatus(hours: number): Promise<BatteryStatus> {
  await connection();
  const fetchedAt = Date.now();
  return { readings: await getJson<BatteryStatusPoint[]>(`/battery-status?hours=${hours}`), fetchedAt };
}

export type Blackout = {
  start: string;
  end: string;
  duration_hours: number;
  ongoing: boolean;
};

export type AcOutputPoint = {
  date: string;
  ac_output: number;
};

export type AcOutputHistory = {
  readings: AcOutputPoint[];
  fetchedAt: number;
};

export async function getAcOutputHistory(hours: number): Promise<AcOutputHistory> {
  await connection();
  const fetchedAt = Date.now();
  return { readings: await getJson<AcOutputPoint[]>(`/ac-output-history?hours=${hours}`), fetchedAt };
}

export type BatteryEstimateStatus = "discharging" | "charging" | "reserve" | "idle" | "stale" | "no_data";

export type BatteryEstimate = {
  computed_at: string;
  status: BatteryEstimateStatus;
  soc: number | null;
  soc_estimate: number | null;
  load_w: number | null;
  drain_pct_per_hour: number | null;
  reserve_percent: number;
  eta: string | null;
  eta_earliest: string | null;
  eta_latest: string | null;
  hours_left: number | null;
  full_eta: string | null;
  hours_to_full: number | null;
  model: { wh_per_percent: number; idle_w: number; steps_used: number; from_history: boolean };
};

export async function getBatteryEstimate(): Promise<BatteryEstimate> {
  return getJson<BatteryEstimate>("/battery-estimate");
}

export type PowerPeriod = { start: string; end: string; receiving_ac: boolean };

export type PowerPeriodsResult = { periods: PowerPeriod[]; fetchedAt: number };

export async function getPowerPeriods(hours: number): Promise<PowerPeriodsResult> {
  await connection();
  const fetchedAt = Date.now();
  return { periods: await getJson<PowerPeriod[]>(`/power-periods?hours=${hours}`), fetchedAt };
}

export type PowerTotals = {
  since: string | null;
  with_power_hours: number;
  without_power_hours: number;
  receiving_ac: boolean | null;
  last_outage_start: string | null;
  outage_ongoing: boolean;
};

export async function getPowerTotals(hours?: number): Promise<PowerTotals> {
  await connection();
  return getJson<PowerTotals>(hours ? `/power-totals?hours=${hours}` : "/power-totals");
}
