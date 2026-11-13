import type { Metadata } from "next";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { LatestReading, LatestReadingSkeleton } from "@/components/energy/latest-reading";
import { BoltIcon } from "@/components/icons/bolt-icon";
import { Page } from "@/components/layout/page";
import { Reveal } from "@/components/ui/reveal";

const REFRESH_INTERVAL_MS = 7_000;

export const metadata: Metadata = {
  title: "Energy · Home Server",
};

export default function EnergyLivePage() {
  return (
    <Page section="Energy" title="Live" Icon={BoltIcon}>
      <Reveal index={1}>
        <Suspense fallback={<LatestReadingSkeleton />}>
          <LatestReading />
        </Suspense>
      </Reveal>
      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </Page>
  );
}
