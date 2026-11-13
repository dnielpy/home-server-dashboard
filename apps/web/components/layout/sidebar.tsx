import { NAV_ITEMS } from "@/components/layout/nav-items";
import { SidebarLink } from "@/components/layout/sidebar-link";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 top-14 z-20 bg-black/40 backdrop-blur-sm transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed top-14 bottom-0 left-0 z-20 w-60 shrink-0 border-r border-surface-border bg-background/70 px-3 py-4 backdrop-blur-xl transition-transform md:sticky md:h-[calc(100dvh-3.5rem)] md:translate-x-0 md:bg-transparent ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.href} item={item} onNavigate={onClose} />
          ))}
        </nav>
      </aside>
    </>
  );
}
