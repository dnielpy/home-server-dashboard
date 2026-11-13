"use client";

import { Card, CardSkeleton, CardUnavailable } from "@/components/dashboard/card";
import { useSystem } from "@/components/dashboard/system-live";
import { UsageMeter } from "@/components/dashboard/usage";
import { DiskIcon } from "@/components/icons/disk-icon";
import type { Disk } from "@/lib/api";
import { formatBytes } from "@/lib/format";

const DISK_NAMES: Record<Disk["name"], string> = {
  system: "System disk",
  external: "External disk",
};

/** How full each of the server's disks is. */
export function DisksCard() {
  const { data, error } = useSystem();
  if (!data) {
    if (!error) return <CardSkeleton />;
    return (
      <Card title="Disks" Icon={DiskIcon} accent="sky">
        <CardUnavailable message={error} />
      </Card>
    );
  }

  return (
    <Card title="Disks" Icon={DiskIcon} accent="sky">
      {data.disks.length === 0 ? (
        <p className="text-sm text-muted">The agent could not read any disk.</p>
      ) : (
        <ul className="flex flex-1 flex-col justify-center gap-5">
          {data.disks.map((disk, index) => (
            <li key={disk.name} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{DISK_NAMES[disk.name]}</span>
                <span className="text-muted tabular-nums">
                  {formatBytes(disk.used_bytes)} of {formatBytes(disk.total_bytes)} ·{" "}
                  <span className="font-medium text-foreground">{Math.round(disk.percent)}%</span>
                </span>
              </div>
              <UsageMeter percent={disk.percent} delay={index * 0.1} />
              <p className="text-xs text-muted tabular-nums">{formatBytes(disk.available_bytes)} free</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
