import type { Metadata } from "next";
import Link from "next/link";

import { ServerIcon } from "@/components/icons/server-icon";
import { Page } from "@/components/layout/page";
import { projectMeta } from "@/components/management/projects";
import { LogsView } from "@/components/settings/logs-view";
import { Reveal } from "@/components/ui/reveal";

// The project is only known at request time, and the sidebar reads the path, so this page renders on each request
export const instant = false;

export const metadata: Metadata = {
  title: "Logs · Settings · Home Server",
};

export default async function LogsPage({ params }: PageProps<"/settings/general/[name]/logs">) {
  const folder = decodeURIComponent((await params).name);

  return (
    <Page section="Settings" title={`${projectMeta(folder).name} logs`} Icon={ServerIcon}>
      <Link href="/settings/general" className="self-start text-sm text-muted transition-colors hover:text-foreground">
        ← General
      </Link>
      <Reveal index={1}>
        <LogsView project={folder} />
      </Reveal>
    </Page>
  );
}
