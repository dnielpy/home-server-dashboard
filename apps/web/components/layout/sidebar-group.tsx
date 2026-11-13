"use client";

import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { ChevronIcon } from "@/components/icons/chevron-icon";
import { isActive, type NavGroup } from "@/components/layout/nav-items";
import { SidebarLink } from "@/components/layout/sidebar-link";

/** A module with its pages folded under it; it opens on its own while one of them is shown. */
export function SidebarGroup({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const pathname = usePathname();
  const listId = useId();
  const inside = group.children.some((link) => isActive(link, pathname));
  const [open, setOpen] = useState(inside);
  const [wasInside, setWasInside] = useState(inside);

  // Arriving at one of its pages from elsewhere opens it; leaving keeps it as the user left it
  if (inside !== wasInside) {
    setWasInside(inside);
    if (inside) setOpen(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover hover:text-foreground ${
          inside ? "text-foreground" : "text-muted"
        }`}
      >
        <group.Icon className="h-5 w-5" />
        {group.label}
        <ChevronIcon className={`ml-auto h-4 w-4 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      <div
        id={listId}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="mt-1 ml-5 flex flex-col gap-0.5 border-l border-surface-border pl-2" inert={!open}>
            {group.children.map((link) => (
              <SidebarLink key={link.href} item={link} nested onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
