"use client";

import { useEffect, useState } from "react";

import { DeviceCard } from "@/components/network/devices/device-card";
import type { Device } from "@/lib/homenet-api";
import { formatKbs } from "@/lib/network/speed-format";
import { serverNow } from "@/lib/server-clock";

const REFRESH_INTERVAL_MS = 5_000;

/** The router's devices, refreshed every few seconds so the speeds stay live. */
export function DeviceList({ initialDevices, fetchedAt }: { initialDevices: Device[]; fetchedAt: number }) {
  const [devices, setDevices] = useState(initialDevices);
  const [now, setNow] = useState(fetchedAt);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const response = await fetch("/api/network/devices", { cache: "no-store" });
        if (!response.ok) throw new Error(`Devices responded with ${response.status}`);
        const next: Device[] = await response.json();
        if (!cancelled) {
          setDevices(next);
          setNow(serverNow());
          setStale(false);
        }
      } catch {
        if (!cancelled) setStale(true);
      }
    }, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function replace(updated: Device) {
    setDevices((current) => current.map((device) => (device.mac === updated.mac ? updated : device)));
  }

  const online = devices.filter((device) => device.online);
  const offline = devices.filter((device) => !device.online);
  const totalDown = online.reduce((sum, device) => sum + device.down_kbs, 0);
  const totalUp = online.reduce((sum, device) => sum + device.up_kbs, 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted tabular-nums">
        {online.length} online · ↓ {formatKbs(totalDown)} · ↑ {formatKbs(totalUp)}
        {stale && <span className="ml-2 text-amber-600 dark:text-amber-400">· Router not answering, showing the last list</span>}
      </p>

      {online.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No device is online.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {online.map((device) => (
            <li key={device.mac}>
              <DeviceCard device={device} now={now} onChange={replace} />
            </li>
          ))}
        </ul>
      )}

      {offline.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-2 text-sm font-medium text-muted select-none transition-colors hover:text-foreground">
            Offline ({offline.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {offline.map((device) => (
              <li key={device.mac}>
                <DeviceCard device={device} now={now} onChange={replace} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
