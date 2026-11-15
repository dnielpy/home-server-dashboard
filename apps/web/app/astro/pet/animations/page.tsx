import type { Metadata } from "next";
import { PlayIcon } from "@/components/icons/play-icon";
import { Page } from "@/components/layout/page";
import { PetAnimations } from "@/components/pet/animations";

export const metadata: Metadata = { title: "Pet · Animaciones · Astro · Home Server" };

export default function PetAnimationsPage() {
  return <Page section="Astro · Pet" title="Animaciones" Icon={PlayIcon}><PetAnimations /></Page>;
}
