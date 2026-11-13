import { type ReactNode, Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { BandwidthCard } from "@/components/dashboard/bandwidth-card";
import { BatteryCard } from "@/components/dashboard/battery-card";
import { BatteryEtaCard } from "@/components/dashboard/battery-eta-card";
import { BatteryHistoryCard } from "@/components/dashboard/battery-history-card";
import { CardSkeleton } from "@/components/dashboard/card";
import { CpuCard } from "@/components/dashboard/cpu-card";
import { DisksCard } from "@/components/dashboard/disks-card";
import { DownloadsCard } from "@/components/dashboard/downloads-card";
import { MemoryCard } from "@/components/dashboard/memory-card";
import { NetworkSpeedCard } from "@/components/dashboard/network-speed-card";
import { PowerCard } from "@/components/dashboard/power-card";
import { ServerTrafficCard } from "@/components/dashboard/server-traffic-card";
import { ServerTrafficHistoryCard } from "@/components/dashboard/server-traffic-history-card";
import { SystemLiveProvider } from "@/components/dashboard/system-live";
import { TopDeviceCard } from "@/components/dashboard/top-device-card";
import { WatchTimeCard } from "@/components/dashboard/watch-time-card";
import { LiveClock } from "@/components/hero/live-clock";
import { SourceStatus, SourceStatusSkeleton } from "@/components/hero/source-status";
import { Reveal } from "@/components/ui/reveal";

const REFRESH_INTERVAL_MS = 30_000;

/** A cell of the grid. `className` sets its span; `index` its turn in the entrance. Each loads on its own. */
function Slot({ index, className, children }: { index: number; className: string; children: ReactNode }) {
  return (
    <Reveal index={index} className={`min-w-0 ${className}`}>
      <Suspense fallback={<CardSkeleton />}>{children}</Suspense>
    </Reveal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 px-1 text-xs font-semibold tracking-[0.18em] text-muted uppercase">
        {title}
        <span aria-hidden className="h-px flex-1 bg-linear-to-r from-surface-border to-transparent" />
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">{children}</div>
    </section>
  );
}

export default function Dashboard() {
  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 p-4 sm:p-6 xl:p-8">
      <h1 className="sr-only">Dashboard</h1>
      <Reveal index={0} className="flex flex-wrap items-center justify-between gap-6">
        <LiveClock />
        <Suspense fallback={<SourceStatusSkeleton />}>
          <SourceStatus />
        </Suspense>
      </Reveal>

      <Section title="Energy">
        <Slot index={1} className="md:col-span-3 xl:col-span-3">
          <BatteryCard />
        </Slot>
        <Slot index={2} className="md:col-span-3 xl:col-span-3">
          <BatteryEtaCard />
        </Slot>
        <Slot index={3} className="md:col-span-6 xl:col-span-6">
          <PowerCard />
        </Slot>
        <Slot index={4} className="md:col-span-6 xl:col-span-12 [&_section]:min-h-72">
          <BatteryHistoryCard />
        </Slot>
      </Section>

      <Section title="Network">
        <Slot index={5} className="md:col-span-3 xl:col-span-4">
          <NetworkSpeedCard />
        </Slot>
        <Slot index={6} className="md:col-span-3 xl:col-span-5">
          <BandwidthCard />
        </Slot>
        <Slot index={7} className="md:col-span-6 xl:col-span-3">
          <TopDeviceCard />
        </Slot>
      </Section>

      <Section title="LocalTube">
        <Slot index={8} className="md:col-span-3 xl:col-span-6">
          <DownloadsCard />
        </Slot>
        <Slot index={9} className="md:col-span-3 xl:col-span-6">
          <WatchTimeCard />
        </Slot>
      </Section>

      <Section title="Server">
        {/* CPU, memory, disks and network update every second; the weekly chart with the rest of the page */}
        <SystemLiveProvider>
          <Slot index={10} className="md:col-span-3 xl:col-span-3">
            <CpuCard />
          </Slot>
          <Slot index={11} className="md:col-span-3 xl:col-span-3">
            <MemoryCard />
          </Slot>
          <Slot index={12} className="md:col-span-6 xl:col-span-6">
            <DisksCard />
          </Slot>
          <Slot index={13} className="md:col-span-6 xl:col-span-4">
            <ServerTrafficCard />
          </Slot>
          <Slot index={14} className="md:col-span-6 xl:col-span-8 [&_section]:min-h-72">
            <ServerTrafficHistoryCard />
          </Slot>
        </SystemLiveProvider>
      </Section>

      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </main>
  );
}
