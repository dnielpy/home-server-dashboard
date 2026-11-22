import type { Metadata } from "next";
import { Suspense } from "react";

import { FilesExplorer } from "@/components/files/files-explorer";
import { FolderIcon } from "@/components/icons/folder-icon";
import { Page } from "@/components/layout/page";
import { PanelSkeleton } from "@/components/ui/panel";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "Files · Tools · Home Server",
};

export default function Files() {
  return (
    <Page section="Tools" title="Files" Icon={FolderIcon}>
      <Reveal index={1}>
        {/* The folder open is in the URL, which the explorer reads in the browser */}
        <Suspense fallback={<PanelSkeleton height={420} />}>
          <FilesExplorer />
        </Suspense>
      </Reveal>
    </Page>
  );
}
