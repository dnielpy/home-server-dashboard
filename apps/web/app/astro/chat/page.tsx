import type { Metadata } from "next";
import { AstroChat } from "@/components/astro/chat";

export const metadata: Metadata = { title: "Chat · Astro · Home Server" };

export default function ChatPage() {
  return <main aria-label="Chat de Astro" className="flex min-h-0 flex-1 flex-col"><AstroChat /></main>;
}
