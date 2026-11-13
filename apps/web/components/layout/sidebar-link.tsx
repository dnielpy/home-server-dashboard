"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActive, type NavLink } from "@/components/layout/nav-items";

export function SidebarLink({ item, nested, onNavigate }: { item: NavLink; nested?: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = isActive(item, pathname);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center rounded-xl font-medium transition-colors ${
        nested ? "gap-2.5 px-3 py-1.5 text-[13px]" : "gap-3 px-3 py-2 text-sm"
      } ${
        active
          ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400"
          : "text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <item.Icon className={nested ? "h-4 w-4" : "h-5 w-5"} />
      {item.label}
    </Link>
  );
}
