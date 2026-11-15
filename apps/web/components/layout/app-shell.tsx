"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { AppBar } from "@/components/layout/app-bar";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Astro's Pet is shown full screen on the server's display, without the dashboard around it
  const bare = usePathname() === "/pet";

  if (bare) return children;

  return (
    <div className="flex h-dvh flex-col">
      <div aria-hidden className="aurora">
        <span />
        <span />
        <span />
      </div>
      <AppBar onMenuClick={() => setSidebarOpen((open) => !open)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
