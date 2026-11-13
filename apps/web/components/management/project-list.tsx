import { ProjectBadge, PanelSection } from "@/components/management/parts";
import type { Project } from "@/lib/api";
import { formatAgo } from "@/lib/format";

function ProjectRow({
  project,
  selected,
  now,
  onSelect,
  onOpen,
}: {
  project: Project;
  selected: boolean;
  now: number | null;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={onSelect}
        onFocus={onSelect}
        aria-current={selected ? "true" : undefined}
        className={`relative flex w-full flex-col gap-1 overflow-hidden rounded-2xl border px-5 py-3.5 text-left transition-colors ${
          selected
            ? "border-sky-500/40 bg-sky-500/6 shadow-[0_0_32px_-12px_rgb(14_165_233/0.6)]"
            : "border-surface-border bg-surface hover:bg-surface-hover"
        }`}
      >
        <span
          aria-hidden
          className={`absolute inset-y-3 left-0 w-1 rounded-r-full bg-sky-500 transition-opacity ${
            selected ? "opacity-100" : "opacity-0"
          }`}
        />
        <span className="flex items-center justify-between gap-3">
          <span className={`truncate font-semibold ${selected ? "text-foreground" : "text-foreground/80"}`}>
            {project.name}
          </span>
          <span className="shrink-0">
            <ProjectBadge project={project} />
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted tabular-nums">
          <span className="font-medium text-violet-600 dark:text-violet-400">{project.branch ?? "?"}</span>
          {project.local_epoch !== null && now !== null && (
            <>
              <span aria-hidden>·</span>
              <span>local {formatAgo(project.local_epoch, now)}</span>
            </>
          )}
          {project.fetch === "err" ? (
            <>
              <span aria-hidden>·</span>
              <span className="text-red-600 dark:text-red-400">GitHub is not answering</span>
            </>
          ) : (
            project.behind > 0 &&
            project.remote_epoch !== null &&
            now !== null && (
              <>
                <span aria-hidden>·</span>
                <span>GitHub {formatAgo(project.remote_epoch, now)}</span>
              </>
            )
          )}
        </span>
      </button>
    </li>
  );
}

/** The first screen of home-server.sh: every project, with how it compares to GitHub. */
export function ProjectList({
  projects,
  selected,
  root,
  now,
  onSelect,
  onOpen,
}: {
  projects: Project[];
  selected: number;
  root: string | null;
  now: number | null;
  onSelect: (index: number) => void;
  onOpen: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <p className="bg-linear-to-r from-cyan-400 via-blue-500 to-violet-500 bg-clip-text text-4xl font-black tracking-[0.2em] text-transparent sm:text-5xl">
          HOME SERVER
        </p>
        <p className="text-sm text-muted">
          update and redeploy your projects
          {root && (
            <>
              <span aria-hidden> · </span>
              <span className="font-mono">{root}</span>
            </>
          )}
        </p>
      </div>

      <PanelSection
        title="Projects"
        aside={projects.length === 1 ? "1 project" : `${projects.length} projects`}
      />
      {projects.length === 0 ? (
        <p className="rounded-r-xl border-l-2 border-amber-500/70 bg-amber-500/5 px-3 py-2 text-sm">
          There are no folders with a git repo in {root ?? "the projects folder"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {projects.map((project, index) => (
            <ProjectRow
              key={project.name}
              project={project}
              selected={index === selected}
              now={now}
              onSelect={() => onSelect(index)}
              onOpen={() => onOpen(index)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
