import { MenuIcon } from "@/components/icons/menu-icon";
import { ServerIcon } from "@/components/icons/server-icon";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-surface-border bg-background/40 px-4 backdrop-blur-xl">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-hover hover:text-foreground md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-emerald-400 to-sky-500 text-white shadow-[0_4px_20px_-4px_rgb(16_185_129/0.7)]">
          <ServerIcon className="h-4.5 w-4.5" />
        </span>
        <span className="font-semibold tracking-tight text-foreground">Home Server</span>
      </div>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
