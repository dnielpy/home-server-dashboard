"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/components/layout/nav-items";

export function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400"
          : "text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <item.Icon className="h-5 w-5" />
      {item.label}
    </Link>
  );
}
