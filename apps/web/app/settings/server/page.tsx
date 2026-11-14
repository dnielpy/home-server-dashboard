import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { CardSkeleton } from "@/components/dashboard/card";
import { CpuCard } from "@/components/dashboard/cpu-card";
import { DisksCard } from "@/components/dashboard/disks-card";
import { MemoryCard } from "@/components/dashboard/memory-card";
import { ServerTrafficCard } from "@/components/dashboard/server-traffic-card";
import { ServerTrafficHistoryCard } from "@/components/dashboard/server-traffic-history-card";
import { SystemLiveProvider } from "@/components/dashboard/system-live";
import { UptimeCard } from "@/components/dashboard/uptime-card";
import { GaugeIcon } from "@/components/icons/gauge-icon";
import { Page } from "@/components/layout/page";
import { PowerControls } from "@/components/settings/power-controls";
import { Reveal } from "@/components/ui/reveal";

const REFRESH_INTERVAL_MS = 30_000;

export const metadata: Metadata = {
  title: "Server · Settings · Home Server",
};

function Slot({ index, className, children }: { index: number; className: string; children: ReactNode }) {
  return (
    <Reveal index={index} className={`min-w-0 ${className}`}>
      <Suspense fallback={<CardSkeleton />}>{children}</Suspense>
    </Reveal>
  );
}

export default function ServerSettings() {
  return (
    <Page section="Settings" title="Server" Icon={GaugeIcon} actions={<PowerControls />}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        {/* CPU, memory, disks and network update every second; the weekly chart with the rest of the page */}
        <SystemLiveProvider>
          <Slot index={1} className="md:col-span-6 xl:col-span-6">
            <UptimeCard />
          </Slot>
          <Slot index={2} className="md:col-span-3 xl:col-span-3">
            <CpuCard />
          </Slot>
          <Slot index={3} className="md:col-span-3 xl:col-span-3">
            <MemoryCard />
          </Slot>
          <Slot index={4} className="md:col-span-6 xl:col-span-6">
            <DisksCard />
          </Slot>
          <Slot index={5} className="md:col-span-6 xl:col-span-6">
            <ServerTrafficCard />
          </Slot>
          <Slot index={6} className="md:col-span-6 xl:col-span-12 [&_section]:min-h-72">
            <ServerTrafficHistoryCard />
          </Slot>
        </SystemLiveProvider>
      </div>
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </Page>
  );
}
