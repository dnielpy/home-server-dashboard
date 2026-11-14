import type { Metadata } from "next";
import { AstroChat } from "@/components/astro/chat";
import { AstroIcon } from "@/components/icons/astro-icon";
import { Page } from "@/components/layout/page";

export const metadata: Metadata = { title: "Chat · Astro · Home Server" };

export default function ChatPage() {
  return <Page section="Astro" title="Chat" Icon={AstroIcon}><AstroChat /></Page>;
}
