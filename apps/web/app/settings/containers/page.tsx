import type { Metadata } from "next";

import { ServerIcon } from "@/components/icons/server-icon";
import { Page } from "@/components/layout/page";
import { ServersPanel } from "@/components/settings/servers-panel";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Containers · Settings · Home Server",
};

export default function ContainersSettings() {
  return (
    <Page section="Settings" title="Containers" Icon={ServerIcon}>
      <Reveal index={1}>
        <ServersPanel />
      </Reveal>
    </Page>
  );
}
