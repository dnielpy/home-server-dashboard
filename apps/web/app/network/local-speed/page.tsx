import type { Metadata } from "next";

import { RouterIcon } from "@/components/icons/router-icon";
import { Page } from "@/components/layout/page";
import { LocalSpeedTestCard } from "@/components/network/local-speed-test-card";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Local speed · Network · Home Server",
};

export default function LocalSpeedPage() {
  return (
    <Page section="Network" title="Local speed" Icon={RouterIcon}>
      <Reveal index={1}>
        <LocalSpeedTestCard />
      </Reveal>
    </Page>
  );
}
