"use client";

import { Card, CardSkeleton, CardUnavailable } from "@/components/dashboard/card";
import { useSystem } from "@/components/dashboard/system-live";
import { UsageMeter } from "@/components/dashboard/usage";
import { DiskIcon } from "@/components/icons/disk-icon";
import type { Disk } from "@/lib/api";
import { formatBytes } from "@/lib/format";

const DISKS: { name: Disk["name"]; label: string; detail: string }[] = [
  { name: "system", label: "Internal disk", detail: "System" },
  { name: "external", label: "External disk", detail: "LocalTube videos" },
];

function DiskStats({ label, detail, disk, delay }: { label: string; detail: string; disk?: Disk; delay: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
      {disk === undefined ? (
        <p className="mt-2 text-sm text-muted">Not plugged in</p>
      ) : (
        <>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
            {Math.round(disk.percent)}
            <span className="ml-0.5 text-lg text-muted">%</span>
          </p>
          <UsageMeter percent={disk.percent} delay={delay} />
          <p className="text-xs text-muted tabular-nums">
            {formatBytes(disk.used_bytes)} of {formatBytes(disk.total_bytes)} · {formatBytes(disk.available_bytes)} free
          </p>
        </>
      )}
    </div>
  );
}

/** How full the server's internal disk is, next to the external one with LocalTube's videos. */
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
      <div className="grid flex-1 grid-cols-2 items-center gap-6">
        {DISKS.map(({ name, label, detail }, index) => (
          <DiskStats
            key={name}
            label={label}
            detail={detail}
            disk={data.disks.find((disk) => disk.name === name)}
            delay={index * 0.1}
          />
        ))}
      </div>
    </Card>
  );
}
