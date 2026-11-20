"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { CardUnavailable } from "@/components/dashboard/card";
import { AgentRequestError, callAgent, projectPath, useNow } from "@/components/management/agent-client";
import { Callout, Spinner } from "@/components/management/parts";
import { projectMeta } from "@/components/management/projects";
import type { ContainerAction, Project } from "@/lib/api";
import { formatElapsedSince, formatSince } from "@/lib/format";

// While a stop, start or restart runs the cards follow it closely; otherwise they only keep the status fresh
const BUSY_POLL_MS = 1_000;
const IDLE_POLL_MS = 10_000;
const RETRY_MS = 5_000;
// The second press that confirms a stop or a restart has to come within this long
const CONFIRM_MS = 3_000;

const PENDING_LABELS: Record<ContainerAction, string> = {
  stop: "Stopping",
  start: "Starting",
  restart: "Restarting",
};

const STATES = {
  up: { icon: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400", pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "Online", accent: "accent-emerald" },
  down: { icon: "bg-red-500/12 text-red-600 dark:text-red-400", pill: "bg-red-500/10 text-red-600 dark:text-red-400", label: "Down", accent: "accent-rose" },
  idle: { icon: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300", pill: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300", label: "Not deployed", accent: "accent-sky" },
  unknown: { icon: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300", pill: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300", label: "Unknown", accent: "accent-sky" },
};

function serviceState(project: Project): keyof typeof STATES {
  const { deployed, up } = project.service;
  if (deployed === null) return "unknown";
  if (deployed === false) return "idle";
  return up ? "up" : "down";
}

const BUTTON_TONES = {
  neutral: "glass text-foreground hover:bg-surface-hover",
  danger: "bg-red-500/10 text-red-600 ring-1 ring-red-500/30 ring-inset hover:bg-red-500/15 dark:text-red-400",
  primary: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30 ring-inset hover:bg-emerald-500/15 dark:text-emerald-400",
};

const BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition";

function ActionButton({
  tone,
  disabled,
  title,
  onClick,
  children,
}: {
  tone: keyof typeof BUTTON_TONES;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${BUTTON} ${BUTTON_TONES[tone]} disabled:pointer-events-none disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function ServerCard({
  project,
  now,
  onAction,
}: {
  project: Project;
  now: number | null;
  onAction: (action: ContainerAction) => Promise<string | null>;
}) {
  const { name, Icon } = projectMeta(project.name);
  const state = serviceState(project);
  const style = STATES[state];
  const pending = project.action?.state === "pending" ? project.action.name : null;
  const [armed, setArmed] = useState<ContainerAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(null), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [armed]);

  async function press(action: ContainerAction) {
    // Starting is harmless; stopping or restarting asks for a second press
    if (action !== "start" && armed !== action) {
      setArmed(action);
      return;
    }
    setArmed(null);
    setError(await onAction(action));
  }

  const busy = pending !== null || project.updating;
  const deployed = project.service.deployed === true;
  const running = project.service.up;
  const failed = project.action?.state === "err" ? project.action : null;

  let since: ReactNode = null;
  if (state === "idle") since = <p className="text-sm text-muted">No containers yet</p>;
  else if (project.service.since && now !== null) {
    since = (
      <p className="text-sm text-muted tabular-nums">
        <span className="font-semibold text-foreground">{formatElapsedSince(project.service.since, now * 1000)}</span>
        <span aria-hidden> · </span>
        {state === "up" ? "up" : "down"} since {formatSince(project.service.since, now * 1000)}
      </p>
    );
  }

  return (
    <section className={`glass glass-glow ${style.accent} flex flex-col gap-4 rounded-3xl p-5 xl:p-6`}>
      <header className="flex items-start gap-3.5">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${style.icon}`}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-foreground">{name}</h3>
          <p className="truncate font-mono text-xs text-muted">{project.name}</p>
        </div>
        {busy ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
            <Spinner className="h-3 w-3" />
            {pending ? PENDING_LABELS[pending] : "Updating"}
          </span>
        ) : (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.pill}`}
          >
            {(state === "up" || state === "down") && <span aria-hidden className="pulse-dot h-1.5 w-1.5" />}
            {style.label}
          </span>
        )}
      </header>

      <div className="flex min-h-10 flex-col justify-center gap-0.5">
        {since}
        {project.service.detail && <p className="truncate text-sm text-muted">{project.service.detail}</p>}
      </div>

      {project.service.ports.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {project.service.ports.map(({ service, port }) => {
            const url = `http://${window.location.hostname}:${port}`;
            return (
              <li key={port} className="min-w-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${service} · ${url}`}
                  className="glass inline-flex max-w-full items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-xs text-foreground transition hover:bg-surface-hover"
                >
                  <span className="text-muted">{service}</span>
                  <span className="truncate">{url.replace("http://", "")}</span>
                  <span aria-hidden>↗</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {(error || failed) && (
        <Callout tone="red">{error ?? `Could not ${failed?.name} it: ${failed?.error ?? "docker failed"}`}</Callout>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-surface-border pt-4">
        <ActionButton tone="neutral" disabled={busy || !deployed} onClick={() => press("restart")}>
          {armed === "restart" ? "Press again to restart" : "↻  Restart"}
        </ActionButton>
        {running || !deployed ? (
          <ActionButton
            tone="danger"
            disabled={busy || !deployed || project.dashboard}
            title={project.dashboard ? "Stopping the dashboard would leave no way to start it again from here" : undefined}
            onClick={() => press("stop")}
          >
            {armed === "stop" ? "Press again to stop" : "■  Stop"}
          </ActionButton>
        ) : (
          <ActionButton tone="primary" disabled={busy} onClick={() => press("start")}>
            ▶  Start
          </ActionButton>
        )}
        <Link
          href={`/settings/containers/${encodeURIComponent(project.name)}/logs`}
          aria-disabled={!deployed}
          className={`${BUTTON} ${BUTTON_TONES.neutral} ml-auto ${deployed ? "" : "pointer-events-none opacity-40"}`}
        >
          Logs  →
        </Link>
      </div>
      {armed === "restart" && project.dashboard && (
        <p className="-mt-2 text-xs text-muted">The dashboard goes away for a few seconds while it restarts.</p>
      )}
    </section>
  );
}

/** A card per project on the server, to stop, start or restart its containers and open their logs. */
export function ServersPanel() {
  const now = useNow();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped to read the projects again right away
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const next = await callAgent<Project[]>("projects", "GET", controller.signal);
        setProjects(next);
        setError(null);
        const busy = next.some((project) => project.action?.state === "pending" || project.updating);
        timer = setTimeout(poll, busy ? BUSY_POLL_MS : IDLE_POLL_MS);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof AgentRequestError ? err.message : "Could not load the projects");
        timer = setTimeout(poll, RETRY_MS);
      }
    }

    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [reload]);

  async function act(project: Project, action: ContainerAction): Promise<string | null> {
    try {
      await callAgent(projectPath(project.name, `/${action}`), "POST");
    } catch (err) {
      return err instanceof AgentRequestError ? err.message : `Could not ${action} it`;
    }
    // Shows it running until the next read says otherwise
    setProjects((current) =>
      current?.map((item) =>
        item.name === project.name ? { ...item, action: { name: action, state: "pending", error: null } } : item,
      ) ?? null,
    );
    setReload((n) => n + 1);
    return null;
  }

  if (projects === null) {
    return error ? (
      <div className="glass rounded-3xl p-6">
        <CardUnavailable message={`The agent on the server is not answering. ${error}`} />
      </div>
    ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="glass shimmer h-56 rounded-3xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Callout tone="amber">The agent stopped answering, showing what it last said. {error}</Callout>}
      {projects.length === 0 ? (
        <Callout tone="amber">There are no projects on the server.</Callout>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <ServerCard key={project.name} project={project} now={now} onAction={(action) => act(project, action)} />
          ))}
        </div>
      )}
    </div>
  );
}
