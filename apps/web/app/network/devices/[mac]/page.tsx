import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { DevicesIcon } from "@/components/icons/devices-icon";
import { Page } from "@/components/layout/page";
import { DeviceDetail } from "@/components/network/devices/device-detail";
import { DeviceHistoryStats } from "@/components/network/devices/device-history-stats";
import { PanelSkeleton } from "@/components/ui/panel";
import { Reveal } from "@/components/ui/reveal";

const REFRESH_INTERVAL_MS = 60_000;

// The MAC is only known at request time, and the sidebar reads the path, so this page renders on each request
export const instant = false;

export const metadata: Metadata = {
  title: "Device · Network · Home Server",
};

export default async function DevicePage({ params, searchParams }: PageProps<"/network/devices/[mac]">) {
  const mac = decodeURIComponent((await params).mac).toUpperCase();
  const query = await searchParams;

  return (
    <Page section="Network" title="Device" Icon={DevicesIcon}>
      <Link href="/network/devices" className="self-start text-sm text-muted transition-colors hover:text-foreground">
        ← Devices
      </Link>
      <Reveal index={1}>
        <Suspense fallback={<PanelSkeleton height={160} />}>
          <DeviceDetail mac={mac} />
        </Suspense>
      </Reveal>
      <Reveal index={2}>
        <Suspense fallback={<PanelSkeleton height={380} />}>
          <DeviceHistoryStats mac={mac} searchParams={query} />
        </Suspense>
      </Reveal>
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </Page>
  );
}
