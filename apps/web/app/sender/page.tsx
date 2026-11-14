import type { Metadata } from "next";

import { SendIcon } from "@/components/icons/send-icon";
import { Page } from "@/components/layout/page";
import { SenderView } from "@/components/sender/sender-view";

export const metadata: Metadata = {
  title: "Sender · Home Server",
};

export default function Sender() {
  return (
    <Page section="Sender" title="Packages" Icon={SendIcon}>
      <SenderView />
    </Page>
  );
}
