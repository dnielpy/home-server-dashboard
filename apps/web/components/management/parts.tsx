import type { ReactNode } from "react";

import { Badge } from "@/components/dashboard/card";
import type { Project } from "@/lib/api";

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

/** A key and what it does, for the panel's footer. */
export function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <kbd className="rounded-md border border-surface-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-foreground shadow-[inset_0_-1px_0_var(--surface-border)]">
        {keys}
      </kbd>
      {label}
    </span>
  );
}

/** A heading with a line to the right, like the dashboard's sections, and an optional count at the end. */
export function PanelSection({ title, aside }: { title: string; aside?: string }) {
  return (
    <h3 className="flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-muted uppercase">
      {title}
      <span aria-hidden className="h-px flex-1 bg-linear-to-r from-surface-border to-surface-border/30" />
      {aside && <span className="font-medium tracking-normal normal-case">{aside}</span>}
    </h3>
  );
}

const CALLOUT_TONES = {
  red: "border-red-500/70 bg-red-500/5",
  amber: "border-amber-500/70 bg-amber-500/5",
};

export function Callout({ tone, children }: { tone: keyof typeof CALLOUT_TONES; children: ReactNode }) {
  return (
    <p className={`rounded-r-xl border-l-2 px-3 py-2 text-sm text-foreground/85 ${CALLOUT_TONES[tone]}`}>{children}</p>
  );
}

/** Whether the project is checking GitHub, could not, has no remote, was never deployed, or how far behind it is. */
export function ProjectBadge({ project }: { project: Project }) {
  switch (project.fetch) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-2 text-xs text-muted">
          <Spinner className="h-3 w-3 text-sky-500" />
          checking
        </span>
      );
    case "err":
      return <Badge tone="red">✗ No connection</Badge>;
    case "noup":
      return <Badge tone="zinc">No remote</Badge>;
  }
  if (project.service.deployed === false) return <Badge tone="sky">○ Not deployed</Badge>;
  if (project.behind === 0) return <Badge tone="green">✓ Up to date</Badge>;
  return (
    <Badge tone="amber" live>
      {project.behind} new
    </Badge>
  );
}

const COMMIT_RE = /^([a-z]+)(\([^)]*\))?(!)?: (.*)$/;

// The colors home-server.sh gives each conventional commit type
const COMMIT_TYPES: Record<string, string> = {
  feat: "text-emerald-600 dark:text-emerald-400",
  fix: "text-red-500 dark:text-red-400",
  perf: "text-amber-600 dark:text-amber-300",
  refactor: "text-violet-600 dark:text-violet-400",
  docs: "text-sky-600 dark:text-sky-300",
  test: "text-orange-600 dark:text-orange-300",
  style: "text-fuchsia-600 dark:text-fuchsia-300",
};

/** A commit message with its conventional type in color: feat(api): … */
export function CommitSubject({ subject }: { subject: string }) {
  const match = COMMIT_RE.exec(subject);
  if (!match) return <span className="text-foreground">{subject}</span>;
  const [, type, scope = "", bang = "", rest] = match;
  return (
    <>
      <span className={`font-medium ${COMMIT_TYPES[type] ?? "text-muted"}`}>{type}</span>
      <span className="text-muted">
        {scope}
        {bang}:
      </span>{" "}
      <span className="text-foreground">{rest}</span>
    </>
  );
}

const BUTTON_TONES = {
  primary:
    "bg-linear-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_8px_24px_-8px_rgb(16_185_129/0.8)] hover:brightness-110",
  neutral: "glass text-foreground hover:bg-surface-hover",
  danger: "bg-red-500/10 text-red-600 ring-1 ring-red-500/30 ring-inset hover:bg-red-500/15 dark:text-red-400",
};

/** The panel's big buttons. `selected` is the one Enter presses, as the arrows move it. */
export function PanelButton({
  tone,
  selected,
  disabled,
  onClick,
  children,
}: {
  tone: keyof typeof BUTTON_TONES;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-w-36 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-40 ${
        BUTTON_TONES[tone]
      } ${selected ? "ring-2 ring-sky-400/70 ring-offset-2 ring-offset-background" : ""}`}
    >
      {children}
    </button>
  );
}

/** The bar at the bottom of the panel with the keys of the screen, like the script's footer. */
export function PanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 -mb-5 mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-surface-border bg-surface/60 px-5 py-3 sm:-mx-8 sm:-mb-6 sm:px-8">
      {children}
    </div>
  );
}
