import type { Metadata } from "next";

import { SendIcon } from "@/components/icons/send-icon";
import { Page } from "@/components/layout/page";
import { NewPackage } from "@/components/sender/new-package";
import { PackagesPanel } from "@/components/sender/packages-panel";
import { SenderRefreshProvider } from "@/components/sender/sender-refresh";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Sender · Tools · Home Server",
};

export default function Sender() {
  return (
    <SenderRefreshProvider>
      <Page section="Tools" title="Sender" Icon={SendIcon} actions={<NewPackage />}>
        <Reveal index={1}>
          <PackagesPanel />
        </Reveal>
      </Page>
    </SenderRefreshProvider>
  );
}
