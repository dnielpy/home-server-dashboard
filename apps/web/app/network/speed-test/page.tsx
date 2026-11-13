import type { Metadata } from "next";

import { GaugeIcon } from "@/components/icons/gauge-icon";
import { Page } from "@/components/layout/page";
import { SpeedTestCard } from "@/components/network/speed-test-card";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Speed test · Network · Home Server",
};

export default function SpeedTestPage() {
  return (
    <Page section="Network" title="Speed test" Icon={GaugeIcon}>
      <Reveal index={1}>
        <SpeedTestCard />
      </Reveal>
    </Page>
  );
}
