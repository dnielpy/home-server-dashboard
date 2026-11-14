import type { Metadata } from "next";

import { AddDownload } from "@/components/downloads/add-download";
import { DownloadsPanel } from "@/components/downloads/downloads-panel";
import { DownloadsRefreshProvider } from "@/components/downloads/downloads-refresh";
import { DownloadIcon } from "@/components/icons/download-icon";
import { Page } from "@/components/layout/page";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Downloads · Tools · Home Server",
};

export default function Downloads() {
  return (
    <DownloadsRefreshProvider>
      <Page section="Tools" title="Downloads" Icon={DownloadIcon} actions={<AddDownload />}>
        <Reveal index={1}>
          <DownloadsPanel />
        </Reveal>
      </Page>
    </DownloadsRefreshProvider>
  );
}
