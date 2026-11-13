import type { Metadata } from "next";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { AcOutputStats } from "@/components/energy/ac-output-stats";
import { BatteryRuntime } from "@/components/energy/battery-runtime";
import { BatteryStats } from "@/components/energy/battery-stats";
import { BatteryIcon } from "@/components/icons/battery-icon";
import { Page } from "@/components/layout/page";
import { PanelSkeleton } from "@/components/ui/panel";
import { Reveal } from "@/components/ui/reveal";

const REFRESH_INTERVAL_MS = 60_000;

export const metadata: Metadata = {
  title: "Battery · Energy · Home Server",
};

export default function BatteryPage({ searchParams }: PageProps<"/energy/battery">) {
  return (
    <Page section="Energy" title="Battery" Icon={BatteryIcon}>
      <Reveal index={1}>
        <Suspense fallback={<PanelSkeleton height={560} />}>
          <BatteryStats searchParams={searchParams} />
        </Suspense>
      </Reveal>
      <Reveal index={2}>
        <Suspense fallback={<PanelSkeleton height={460} />}>
          <AcOutputStats searchParams={searchParams} />
        </Suspense>
      </Reveal>
      <Reveal index={3}>
        <BatteryRuntime />
      </Reveal>
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </Page>
  );
}
