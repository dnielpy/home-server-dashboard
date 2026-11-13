import { connection } from "next/server";
import { cache } from "react";

export class ApiUnavailableError extends Error {}

/** The API answered, but the app a card reads from (Bluetti, Home Net, LocalTube) did not. */
export class SourceUnavailableError extends ApiUnavailableError {
  readonly source: string;

  constructor(source: string, message: string) {
    super(message);
    this.source = source;
  }
}

function apiUrl(path: string): string {
  const base = process.env.API_URL ?? "http://localhost:3021";
  return new URL(path, base).toString();
}

async function getJson<T>(path: string): Promise<T> {
  await connection();
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { cache: "no-store" });
  } catch (error) {
    throw new ApiUnavailableError("Could not reach the API", { cause: error });
  }

  if (response.status === 502) {
    const body: { detail?: string; source?: string } | null = await response.json().catch(() => null);
    throw new SourceUnavailableError(body?.source ?? "unknown", body?.detail ?? "An app did not answer");
  }
  if (!response.ok) {
    throw new ApiUnavailableError(`API responded with ${response.status}`);
  }
  return response.json();
}

export type PowerPeriod = {
  start: string;
  end: string;
  receiving_ac: boolean;
};

export type Power = {
  hours: number;
  with_power_hours: number;
  without_power_hours: number;
  receiving_ac: boolean | null;
  outage_ongoing: boolean;
  periods: PowerPeriod[];
};

export type BatteryState = "full" | "charging" | "discharging" | "idle" | "unknown";

export type Battery = {
  soc: number | null;
  state: BatteryState;
  load_w: number | null;
  reserve_percent: number;
  eta: string | null;
  hours_left: number | null;
  eta_kind: "reserve" | "full" | null;
};

export type BatteryHistory = {
  hours: number;
  points: { at: string; soc: number | null; load_w: number | null }[];
};

export type NetworkSpeed = {
  measured_at: string;
  rx_bytes_per_second: number;
  tx_bytes_per_second: number;
};

export type TopDevice = {
  mac: string;
  name: string;
  down_bytes: number;
  up_bytes: number;
};

export type NetworkUsage = {
  hours: number;
  total_rx_bytes: number;
  total_tx_bytes: number;
  top_device: TopDevice | null;
  /** Missing from an API older than the redesign. */
  hourly?: { start: string; rx_bytes: number; tx_bytes: number }[];
};

export type SpeedTest = {
  measured_at: string;
  download_mbps: number;
  ping_ms: number | null;
};

export type Download = {
  id: string;
  title: string | null;
  status: string;
  progress: number;
  speed: string | null;
  eta: string | null;
};

export type WatchTime = {
  profile_id: string;
  name: string;
  seconds: number;
};

export type LocalTube = {
  downloading: { count: number; items: Download[] };
  watch_time: WatchTime[];
};

// Two cards read each of these; cache() makes them share one request per render
export const getPower = cache(() => getJson<Power>("/dashboard/power"));
export const getBattery = cache(() => getJson<Battery>("/dashboard/battery"));
export const getNetworkUsage = cache(() => getJson<NetworkUsage>("/dashboard/network/usage"));
export const getLocalTube = cache(() => getJson<LocalTube>("/dashboard/localtube"));

export function getBatteryHistory(): Promise<BatteryHistory> {
  return getJson<BatteryHistory>("/dashboard/battery/history");
}

export function getSpeedTest(): Promise<SpeedTest | null> {
  return getJson<SpeedTest | null>("/dashboard/network/speed-test");
}

export function getNetworkSpeed(): Promise<NetworkSpeed> {
  return getJson<NetworkSpeed>("/dashboard/network/speed");
}
