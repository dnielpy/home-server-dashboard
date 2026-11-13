import type { Metadata } from "next";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { PeriodRanking } from "@/components/energy/period-ranking";
import { PowerHoursCard } from "@/components/energy/power-hours-card";
import { BlackoutIcon } from "@/components/icons/blackout-icon";
import { Page } from "@/components/layout/page";
import { PanelSkeleton } from "@/components/ui/panel";
import { Reveal } from "@/components/ui/reveal";

const REFRESH_INTERVAL_MS = 60_000;

export const metadata: Metadata = {
  title: "Blackouts · Energy · Home Server",
};

export default function BlackoutsPage({ searchParams }: PageProps<"/energy/blackouts">) {
  return (
    <Page section="Energy" title="Blackouts" Icon={BlackoutIcon}>
      <Reveal index={1}>
        <Suspense fallback={<PanelSkeleton height={240} />}>
          <PowerHoursCard />
        </Suspense>
      </Reveal>
      <div className="grid gap-5 2xl:grid-cols-2">
        <Reveal index={2} className="min-w-0">
          <Suspense fallback={<PanelSkeleton height={300} />}>
            <PeriodRanking kind="blackout" searchParams={searchParams} />
          </Suspense>
        </Reveal>
        <Reveal index={3} className="min-w-0">
          <Suspense fallback={<PanelSkeleton height={300} />}>
            <PeriodRanking kind="power" searchParams={searchParams} />
          </Suspense>
        </Reveal>
      </div>
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </Page>
  );
}
