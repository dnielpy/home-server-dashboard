import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { ManagementPanel } from "@/components/management/management-panel";
import { ProjectStatus, ProjectStatusSkeleton } from "@/components/management/project-status";
import { Reveal } from "@/components/ui/reveal";

const REFRESH_INTERVAL_MS = 30_000;

export default function Management() {
  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 p-4 sm:p-6 xl:p-8">
      <h1 className="sr-only">Management</h1>
      <Reveal index={0}>
        <Suspense fallback={<ProjectStatusSkeleton />}>
          <ProjectStatus />
        </Suspense>
      </Reveal>

      <Reveal index={1}>
        <ManagementPanel />
      </Reveal>

      <AutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
    </main>
  );
}
