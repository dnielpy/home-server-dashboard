import type { Metadata } from "next";

import { ServerIcon } from "@/components/icons/server-icon";
import { Page } from "@/components/layout/page";
import { ServersPanel } from "@/components/settings/servers-panel";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "General · Settings · Home Server",
};

export default function GeneralSettings() {
  return (
    <Page section="Settings" title="General" Icon={ServerIcon}>
      <Reveal index={1}>
        <ServersPanel />
      </Reveal>
    </Page>
  );
}
