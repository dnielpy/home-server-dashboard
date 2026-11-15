import type { Metadata } from "next";
import { PetShow } from "@/components/pet/show";

export const metadata: Metadata = { title: "Astro" };

/** Astro full screen, for the server's own display: no bar, no sidebar. */
export default function PetPage() {
  return <PetShow />;
}
