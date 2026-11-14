import type { Metadata } from "next";

import { EventsPanel } from "@/components/events/events-panel";
import { BellIcon } from "@/components/icons/bell-icon";
import { Page } from "@/components/layout/page";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = { title: "Events · Astro · Home Server" };

export default function Events() {
  return (
    <Page section="Astro" title="Events" Icon={BellIcon}>
      <Reveal index={1}><EventsPanel /></Reveal>
    </Page>
  );
}
