import { TIME_ZONE } from "@/lib/time-zone";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

const clockFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/** Bits per second, the unit internet plans and speed tests use. */
export function formatBitsPerSecond(bytesPerSecond: number): { value: string; unit: string } {
  const mbps = (bytesPerSecond * 8) / 1_000_000;
  if (mbps < 1) return { value: ((bytesPerSecond * 8) / 1_000).toFixed(0), unit: "kbps" };
  return { value: mbps.toFixed(mbps >= 10 ? 0 : 1), unit: "Mbps" };
}

export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

/** How long ago a past moment was, as 3 h 20 min. */
export function formatElapsedSince(value: string | number, now = Date.now()): string {
  return formatElapsed(now - new Date(value).getTime());
}

export function formatHours(hours: number): string {
  return hours > 0 ? formatElapsed(hours * 3_600_000) : "None";
}

export function formatClock(value: string | number): string {
  return clockFormat.format(new Date(value));
}

/** The same as formatBytes, split so the number can be animated and the unit styled apart. */
export function splitBytes(bytes: number): { value: number; unit: string; digits: number } {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return { value, unit: UNITS[unit], digits: unit === 0 || value >= 100 ? 0 : 1 };
}

const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

/** A chart axis label, e.g. 14:00. */
export function formatHour(value: string | number): string {
  return hourFormat.format(new Date(value));
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short" });

/** A past moment as 14:05 when it was today, or 12 Nov, 14:05 before that. */
export function formatSince(value: string | number, now = Date.now()): string {
  const date = new Date(value);
  const sameDay = dayFormat.format(date) === dayFormat.format(now);
  return sameDay ? formatClock(date.getTime()) : `${dayFormat.format(date)}, ${formatClock(date.getTime())}`;
}

/** How long ago a Unix time (seconds) was, as the update panel shows it: just now, 5 min ago, yesterday… */
export function formatAgo(epochSeconds: number, nowSeconds = Date.now() / 1000): string {
  const seconds = Math.max(0, nowSeconds - epochSeconds);
  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} h ago`;
  if (seconds < 172_800) return "yesterday";
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)} days ago`;
  if (seconds < 31_536_000) {
    const months = Math.floor(seconds / 2_592_000);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(seconds / 31_536_000);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/** A step's duration: 7s, 1m 05s. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
}

/** A running clock: 02:35. */
export function formatStopwatch(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

const commitDateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** A commit's date, as 2026-11-13 14:05. */
export function formatCommitDate(epochSeconds: number): string {
  return commitDateFormat.format(new Date(epochSeconds * 1000));
}
