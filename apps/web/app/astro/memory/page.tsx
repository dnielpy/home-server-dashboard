import type { Metadata } from "next";
import { AstroMemory } from "@/components/astro/memory";
import { AstroIcon } from "@/components/icons/astro-icon";
import { Page } from "@/components/layout/page";

export const metadata: Metadata = { title: "Memoria · Astro · Home Server" };

export default function MemoryPage() {
  return <Page section="Astro" title="Memoria" Icon={AstroIcon}><AstroMemory /></Page>;
}
