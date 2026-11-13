import { type ReactNode, Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { BandwidthCard } from "@/components/dashboard/bandwidth-card";
import { BatteryCard } from "@/components/dashboard/battery-card";
import { BatteryEtaCard } from "@/components/dashboard/battery-eta-card";
import { CardSkeleton } from "@/components/dashboard/card";
import { DownloadsCard } from "@/components/dashboard/downloads-card";
import { NetworkSpeedCard } from "@/components/dashboard/network-speed-card";
import { PowerCard } from "@/components/dashboard/power-card";
import { TopDeviceCard } from "@/components/dashboard/top-device-card";
import { WatchTimeCard } from "@/components/dashboard/watch-time-card";

const REFRESH_INTERVAL_MS = 30_000;

/** A cell of the grid: one column, or two for the wider cards. Each loads on its own. */
function Slot({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : "col-span-2 sm:col-span-1"}`}>
      <Suspense fallback={<CardSkeleton />}>{children}</Suspense>
    </div>
  );
}

export default function Dashboard() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Slot>
          <BatteryCard />
        </Slot>
        <Slot>
          <BatteryEtaCard />
        </Slot>
        <Slot wide>
          <PowerCard />
        </Slot>
        <Slot>
          <NetworkSpeedCard />
        </Slot>
        <Slot>
          <BandwidthCard />
        </Slot>
        <Slot wide>
          <TopDeviceCard />
        </Slot>
        <Slot wide>
          <DownloadsCard />
        </Slot>
        <Slot wide>
          <WatchTimeCard />
        </Slot>
      </div>
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </main>
  );
}
