"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import type { Device, DeviceAction } from "@/lib/homenet-api";
import { formatBytes } from "@/lib/network/bytes-format";
import { formatDateTime, formatElapsed } from "@/lib/network/outage-format";
import { formatKbs } from "@/lib/network/speed-format";

type Editing = "none" | "limit" | "name";

export function deviceLabel(device: Device): string {
  return device.name || "Unknown device";
}

async function sendAction(mac: string, action: DeviceAction, body: unknown): Promise<Device> {
  const response = await fetch(`/api/network/devices/${encodeURIComponent(mac)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null))?.detail;
    throw new Error(typeof detail === "string" ? detail : `The router did not accept it (${response.status})`);
  }
  return response.json();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function Badge({ tone, children }: { tone: "red" | "amber"; children: string }) {
  const colors =
    tone === "red"
      ? "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400"
      : "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${colors}`}>{children}</span>;
}

const buttonClass =
  "glass rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50";
const primaryButtonClass =
  "rounded-xl bg-linear-to-br from-sky-400 to-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-[0_4px_20px_-6px_rgb(14_165_233/0.8)] transition-opacity hover:opacity-90 disabled:opacity-50";
const inputClass =
  "w-full rounded-xl border border-surface-border bg-surface px-3 py-1.5 text-sm text-foreground tabular-nums outline-none focus:border-sky-500/50";

function limitText(device: Device): string | null {
  const parts = [
    device.limit_down_kbs ? `↓ ${formatKbs(device.limit_down_kbs)}` : null,
    device.limit_up_kbs ? `↑ ${formatKbs(device.limit_up_kbs)}` : null,
  ].filter(Boolean);
  return parts.length ? `Limit ${parts.join(" ")}` : null;
}

type DeviceCardProps = {
  device: Device;
  /** When the device was read, to show how long it has been connected. */
  now: number;
  onChange: (device: Device) => void;
};

export function DeviceCard({ device, now, onChange }: DeviceCardProps) {
  const [editing, setEditing] = useState<Editing>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: DeviceAction, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      onChange(await sendAction(device.mac, action, body));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleInternet() {
    if (!device.blocked && !window.confirm(`Cut internet to ${deviceLabel(device)}?`)) return;
    await run("block", { blocked: !device.blocked });
  }

  async function saveLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => Math.max(0, Math.round(Number(form.get(key)) || 0));
    if (await run("limit", { down_kbs: value("down"), up_kbs: value("up") })) setEditing("none");
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (name && (await run("name", { name }))) setEditing("none");
  }

  const limit = limitText(device);

  return (
    <article className={`glass glass-glow ${device.online ? "accent-sky" : "accent-violet"} rounded-2xl p-4`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${device.online ? "bg-emerald-500 shadow-[0_0_10px_rgb(16_185_129)]" : "bg-slate-500/60"}`}
            />
            <Link
              href={`/network/devices/${encodeURIComponent(device.mac)}`}
              className="truncate font-semibold text-foreground hover:underline"
            >
              {deviceLabel(device)}
            </Link>
            <span className="sr-only">{device.online ? "online" : "offline"}</span>
            {device.blocked && <Badge tone="red">No internet</Badge>}
            {limit && <Badge tone="amber">{limit}</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted tabular-nums">
            {device.ip ?? "No IP"} · {device.mac}
          </p>
        </div>

        {device.in_router && (
          <div className="flex shrink-0 items-center gap-2 text-sm text-muted">
            <span aria-hidden className="hidden sm:inline">
              Internet
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={!device.blocked}
              aria-label={`Internet for ${deviceLabel(device)}`}
              disabled={busy}
              onClick={toggleInternet}
              className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                device.blocked ? "bg-track" : "bg-emerald-500 shadow-[0_0_14px_-2px_rgb(16_185_129/0.8)]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                  device.blocked ? "left-0.5" : "left-[1.375rem]"
                }`}
              />
            </button>
          </div>
        )}
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Download" value={device.online ? formatKbs(device.down_kbs) : "—"} />
        <Stat label="Upload" value={device.online ? formatKbs(device.up_kbs) : "—"} />
        <Stat
          label={device.online ? "Connected for" : "Last seen"}
          value={
            device.online && device.connected_since
              ? formatElapsed(now - Date.parse(device.connected_since))
              : device.last_seen
                ? formatDateTime(device.last_seen)
                : "—"
          }
        />
        <Stat
          label="Used in 24 h"
          value={`↓ ${formatBytes(device.usage_24h_down_bytes)} · ↑ ${formatBytes(device.usage_24h_up_bytes)}`}
        />
      </dl>

      {device.in_router && editing === "none" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing("limit")}>
            Limit speed
          </button>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing("name")}>
            Rename
          </button>
        </div>
      )}

      {editing === "limit" && (
        <form onSubmit={saveLimit} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs text-muted">
            Download limit (KB/s)
            <input
              name="down"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={device.limit_down_kbs || ""}
              placeholder="Unlimited"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="flex-1 text-xs text-muted">
            Upload limit (KB/s)
            <input
              name="up"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={device.limit_up_kbs || ""}
              placeholder="Unlimited"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={busy}>
              Save
            </button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing("none")}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {editing === "name" && (
        <form onSubmit={saveName} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs text-muted">
            Name in the router
            <input
              name="name"
              type="text"
              required
              maxLength={32}
              defaultValue={device.name}
              autoFocus
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={busy}>
              Save
            </button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing("none")}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </article>
  );
}
