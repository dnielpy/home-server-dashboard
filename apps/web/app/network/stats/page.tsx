import type { Metadata } from "next";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { ChartIcon } from "@/components/icons/chart-icon";
import { Page } from "@/components/layout/page";
import { BandwidthStats } from "@/components/network/bandwidth-stats";
import { ConnectionStatusCard } from "@/components/network/connection-status-card";
import { DeviceUsageStats } from "@/components/network/device-usage-stats";
import { HistoryStats } from "@/components/network/history-stats";
import { OutageStats } from "@/components/network/outage-stats";
import { PanelSkeleton } from "@/components/ui/panel";
import { Reveal } from "@/components/ui/reveal";

const REFRESH_INTERVAL_MS = 60_000;

export const metadata: Metadata = {
  title: "Stats · Network · Home Server",
};

export default function NetworkStatsPage({ searchParams }: PageProps<"/network/stats">) {
  return (
    <Page section="Network" title="Stats" Icon={ChartIcon}>
      <Reveal index={1}>
        <Suspense fallback={<PanelSkeleton height={220} />}>
          <ConnectionStatusCard />
        </Suspense>
      </Reveal>
      <Reveal index={2}>
        <Suspense fallback={<PanelSkeleton height={180} />}>
          <HistoryStats searchParams={searchParams} />
        </Suspense>
      </Reveal>
      <Reveal index={3}>
        <Suspense fallback={<PanelSkeleton height={460} />}>
          <DeviceUsageStats searchParams={searchParams} />
        </Suspense>
      </Reveal>
      <Reveal index={4}>
        <Suspense fallback={<PanelSkeleton height={420} />}>
          <BandwidthStats searchParams={searchParams} />
        </Suspense>
      </Reveal>
      <Reveal index={5}>
        <Suspense fallback={<PanelSkeleton height={260} />}>
          <OutageStats searchParams={searchParams} />
        </Suspense>
      </Reveal>
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </Page>
  );
}
