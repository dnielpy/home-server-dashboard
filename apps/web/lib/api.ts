import { connection } from "next/server";
import { cache } from "react";

export class ApiUnavailableError extends Error {}

/** The API answered, but the app a card reads from (Bluetti, Home Net, LocalTube) did not. */
export class SourceUnavailableError extends ApiUnavailableError {
  readonly source: string;

  constructor(source: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.source = source;
  }
}

function apiUrl(path: string): string {
  const base = process.env.API_URL ?? "http://localhost:3021";
  return new URL(path, base).toString();
}

/** Passes a request of the browser on to the API as it is, answering 503 when the API cannot be reached. */
export async function forward(path: string, method: "GET" | "POST"): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method, cache: "no-store" });
  } catch {
    return Response.json({ detail: "Could not reach the dashboard API" }, { status: 503 });
  }
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}

// The headers a file upload or download needs to pass through whole, and the ones a browser resumes a download with
const PROXIED_HEADERS = [
  "Content-Type",
  "Content-Length",
  "Content-Disposition",
  "Cache-Control",
  "Retry-After",
  "Accept-Ranges",
  "Content-Range",
  "ETag",
  "Last-Modified",
];
const PROXIED_REQUEST_HEADERS = ["Content-Type", "Range", "If-Range"];

/** Like forward(), but streams the request's body to the API and the API's answer back, with its file headers. */
export async function proxy(path: string, request: Request): Promise<Response> {
  // Not the length: a streamed body goes chunked, so the size travels in the query (?size=) instead
  const headers = new Headers();
  for (const name of PROXIED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: request.method,
      headers,
      body: request.body,
      // Node's fetch needs this to send a body that is a stream
      duplex: "half",
      cache: "no-store",
      // A download the browser cancels stops reading from the API too, so the file is not deleted
      signal: request.signal,
    } as RequestInit);
  } catch {
    return Response.json({ detail: "Could not reach the dashboard API" }, { status: 503 });
  }
  const out = new Headers();
  for (const name of PROXIED_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers: out });
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

export type SourceStatus = {
  source: "bluetti" | "homenet" | "localtube";
  up: boolean;
  since: string;
  detail: string | null;
};

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

export type Disk = {
  name: "system" | "external";
  mount: string;
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  percent: number;
};

export type TrafficPoint = {
  at: string;
  rx_bytes_per_second: number | null;
  tx_bytes_per_second: number | null;
};

export type System = {
  updated_at: string;
  cpu_percent: number | null;
  /** Null away from Linux, where there is no /proc/meminfo. */
  memory: { total_bytes: number; used_bytes: number; available_bytes: number; percent: number } | null;
  disks: Disk[];
  network: {
    interface: string | null;
    rx_bytes_per_second: number | null;
    tx_bytes_per_second: number | null;
    total_rx_bytes: number;
    total_tx_bytes: number;
  };
  /** Null from an agent older than this field. */
  boot: Boot | null;
};

export type Boot = {
  /** Null away from Linux. */
  booted_at: string | null;
  /** How the boot before this one ended; null when the agent cannot read the journal. */
  last_shutdown: {
    at: string;
    /** True when systemd shut it down (a restart or a power off), false when it was cut off (power lost, hung). */
    clean: boolean;
  } | null;
};

export type SystemTraffic = {
  interval_minutes: number;
  points: TrafficPoint[];
};

// Two cards read each of these; cache() makes them share one request per render
export const getPower = cache(() => getJson<Power>("/dashboard/power"));
export const getBattery = cache(() => getJson<Battery>("/dashboard/battery"));
export const getNetworkUsage = cache(() => getJson<NetworkUsage>("/dashboard/network/usage"));
export const getLocalTube = cache(() => getJson<LocalTube>("/dashboard/localtube"));

export function getStatus(): Promise<SourceStatus[]> {
  return getJson<SourceStatus[]>("/dashboard/status");
}

export function getBatteryHistory(): Promise<BatteryHistory> {
  return getJson<BatteryHistory>("/dashboard/battery/history");
}

export function getSpeedTest(): Promise<SpeedTest | null> {
  return getJson<SpeedTest | null>("/dashboard/network/speed-test");
}

export function getSystemTraffic(): Promise<SystemTraffic> {
  return getJson<SystemTraffic>("/dashboard/system/traffic");
}

export function getNetworkSpeed(): Promise<NetworkSpeed> {
  return getJson<NetworkSpeed>("/dashboard/network/speed");
}

// Management: the projects on the server, as the agent there reports them. Times are Unix seconds.

export type AgentInfo = {
  user: string;
  host: string;
  root: string;
};

export type ServiceStatus = {
  /** False when the project never had containers, null when Docker could not be asked. */
  deployed: boolean | null;
  up: boolean;
  since: string | null;
  detail: string | null;
  /** The host ports its containers publish, to open them in the browser. */
  ports: { service: string; port: number }[];
};

export type FetchState = "pending" | "ok" | "err" | "noup";

export type Project = {
  name: string;
  path: string;
  branch: string | null;
  fetch: FetchState;
  fetch_error: string | null;
  behind: number;
  local_epoch: number | null;
  remote_epoch: number | null;
  service: ServiceStatus;
  updating: boolean;
  /** The last stop, start or restart of its containers from the dashboard. */
  action: ContainerActionState | null;
  /** The dashboard itself, which can be restarted but not stopped from here. */
  dashboard: boolean;
};

export type ContainerAction = "stop" | "start" | "restart";

export type ContainerActionState = {
  name: ContainerAction;
  state: "pending" | "ok" | "err";
  error: string | null;
};

export type ContainerLogs = {
  containers: string[];
  container: string | null;
  lines: { time: string | null; text: string }[];
};

export type Commit = {
  hash: string;
  epoch: number;
  subject: string;
};

export type ProjectDetail = Project & {
  has_upstream: boolean;
  head: Commit | null;
  remote: Commit | null;
  ahead: number;
  commits: (Commit & { author: string })[];
  dirty: boolean;
};

export type UpdateStep = {
  label: string;
  started_at: number;
  finished_at: number | null;
};

export type UpdateJob = {
  project: string;
  running: boolean;
  code: number | null;
  cancelled: boolean;
  first_deploy: boolean;
  started_at: number;
  finished_at: number | null;
  hash: string | null;
  steps: UpdateStep[];
  expected_steps: string[];
  lines: string[];
  offset: number;
  total_lines: number;
  now: number;
};

export function getProjects(): Promise<Project[]> {
  return getJson<Project[]>("/management/projects");
}

export type SenderFile = {
  id: string;
  name: string;
  size: number;
  downloaded: boolean;
};

export type SenderPackage = {
  id: string;
  name: string;
  created_at: string;
  /** The files still waiting to be downloaded and their size. */
  file_count: number;
  total_bytes: number;
};

export type SenderUnlock = {
  package: SenderPackage;
  files: SenderFile[];
  /** Downloads the package's files for half an hour. */
  token: string;
};

export type ServerDownloadState = "queued" | "downloading" | "paused" | "done" | "failed";

/** A file the server downloads by itself (Tools › Downloads). */
export type ServerDownload = {
  id: string;
  url: string;
  name: string;
  state: ServerDownloadState;
  /** The whole file's size, null until the server it comes from says it. */
  size: number | null;
  /** The bytes already on the server; a download goes on from here. */
  received: number;
  /** Bytes per second over the last few seconds. */
  speed: number;
  /** The last cut while it is retried, or why it failed. */
  error: string | null;
  attempts: number;
  max_attempts: number;
  /** When the next try is, while it waits after a cut. */
  retry_at: string | null;
  created_at: string;
  finished_at: string | null;
};

// Files: the external disk, as the agent on the server lists it. Paths are relative to the disk, "" for its top.

export type FileEntry = {
  name: string;
  kind: "folder" | "file";
  /** Null for a folder. */
  size: number | null;
  /** Unix seconds. */
  modified: number;
  link: boolean;
  /** A top-level folder an app writes to, which cannot be renamed or deleted. */
  protected: boolean;
};

export type Folder = {
  path: string;
  entries: FileEntry[];
  disk: { total: number; free: number };
};
