import type { Metadata } from "next";
import { Suspense } from "react";

import { TrafficIcon } from "@/components/icons/traffic-icon";
import { Page } from "@/components/layout/page";
import { LiveConnection, LiveConnectionSkeleton } from "@/components/network/live-connection";
import { LiveDownload } from "@/components/network/live-download";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Network · Home Server",
};

export default function NetworkLivePage() {
  return (
    <Page section="Network" title="Live" Icon={TrafficIcon}>
      <Reveal index={1}>
        <Suspense fallback={<LiveConnectionSkeleton />}>
          <LiveConnection />
        </Suspense>
      </Reveal>
      <Reveal index={2}>
        <LiveDownload />
      </Reveal>
    </Page>
  );
}
