import type { Metadata } from "next";

import { GitBranchIcon } from "@/components/icons/git-branch-icon";
import { Page } from "@/components/layout/page";
import { ManagementPanel } from "@/components/management/management-panel";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "CI/CD · Settings · Home Server",
};

export default function CicdSettings() {
  return (
    <Page section="Settings" title="CI/CD" Icon={GitBranchIcon}>
      <Reveal index={1}>
        <ManagementPanel />
      </Reveal>
    </Page>
  );
}
