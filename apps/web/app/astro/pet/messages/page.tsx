import type { Metadata } from "next";
import { SignIcon } from "@/components/icons/sign-icon";
import { Page } from "@/components/layout/page";
import { PetMessages } from "@/components/pet/messages";

export const metadata: Metadata = { title: "Pet · Mensajes · Astro · Home Server" };

export default function PetMessagesPage() {
  return <Page section="Astro · Pet" title="Mensajes" Icon={SignIcon}><PetMessages /></Page>;
}
