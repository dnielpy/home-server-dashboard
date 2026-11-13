"use client";

import { useEffect, useRef, useState } from "react";

import { CardUnavailable } from "@/components/dashboard/card";
import { AgentRequestError, callAgent, projectPath, useKeys, useNow } from "@/components/management/agent-client";
import { KeyHint, PanelButton, PanelFooter } from "@/components/management/parts";
import { ProjectDetailView } from "@/components/management/project-detail";
import { ProjectList } from "@/components/management/project-list";
import { UpdateView } from "@/components/management/update-view";
import type { AgentInfo, Project } from "@/lib/api";
import { formatClock } from "@/lib/format";

// While a fetch or an update runs the list follows it closely; otherwise it only keeps the badges fresh
const BUSY_POLL_MS = 1_000;
const IDLE_POLL_MS = 10_000;
const RETRY_MS = 5_000;

type View = { screen: "list" } | { screen: "detail"; name: string } | { screen: "update"; name: string; start: boolean };

/** home-server.sh in the browser: the list of projects, a project against GitHub, and its update running. */
export function ManagementPanel() {
  const now = useNow();
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ screen: "list" });
  const [selected, setSelected] = useState(0);
  // Bumped to read the list again right away
  const [reload, setReload] = useState(0);
  // An update already running when the page opened is followed straight away, once
  const followedRunning = useRef(false);

  useEffect(() => {
    callAgent<AgentInfo>("info")
      .then(setInfo)
      .catch(() => undefined);
    // Like the script on start: every project asks GitHub
    callAgent("projects/fetch", "POST")
      .catch(() => undefined)
      .finally(() => setReload((n) => n + 1));
  }, []);

  useEffect(() => {
    if (view.screen !== "list") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const next = await callAgent<Project[]>("projects", "GET", controller.signal);
        setProjects(next);
        setError(null);
        if (!followedRunning.current) {
          followedRunning.current = true;
          const running = next.find((project) => project.updating);
          if (running) {
            setView({ screen: "update", name: running.name, start: false });
            return;
          }
        }
        const busy = next.some((project) => project.fetch === "pending" || project.updating);
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
  }, [view.screen, reload]);

  const count = projects?.length ?? 0;
  const current = count > 0 ? Math.min(selected, count - 1) : 0;

  function open(index: number) {
    if (projects?.[index]) setView({ screen: "detail", name: projects[index].name });
  }

  function recheck() {
    callAgent("projects/fetch", "POST")
      .catch(() => undefined)
      .finally(() => setReload((n) => n + 1));
  }

  useKeys((key) => {
    if (view.screen !== "list") return;
    if (key === "r") recheck();
    if (count === 0) return;
    if (key === "up") setSelected((current - 1 + count) % count);
    else if (key === "down") setSelected((current + 1) % count);
    else if (key === "enter" || key === "right" || key === "l") open(current);
  });

  function backToList(name?: string) {
    if (name) callAgent(projectPath(name, "/fetch"), "POST").catch(() => undefined);
    setView({ screen: "list" });
  }

  const crumbs =
    view.screen === "list" ? [] : view.screen === "detail" ? [view.name] : [view.name, "updating"];

  let body;
  if (view.screen === "detail") {
    body = (
      <ProjectDetailView
        key={view.name}
        name={view.name}
        now={now}
        onBack={() => backToList()}
        onUpdate={() => setView({ screen: "update", name: view.name, start: true })}
      />
    );
  } else if (view.screen === "update") {
    body = (
      <UpdateView key={view.name} name={view.name} start={view.start} now={now} onDone={() => backToList(view.name)} />
    );
  } else if (projects === null) {
    body = error ? (
      <CardUnavailable message={`The agent on the server is not answering. ${error}`} />
    ) : (
      <div className="flex flex-col gap-2.5 py-2">
        <div className="shimmer mx-auto mb-6 h-12 w-72 rounded-xl bg-track" />
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="shimmer h-16 rounded-2xl bg-track" />
        ))}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {error && <CardUnavailable message={`The agent stopped answering. ${error}`} />}
        <ProjectList
          projects={projects}
          selected={current}
          root={info?.root ?? null}
          now={now}
          onSelect={setSelected}
          onOpen={open}
        />
        <PanelFooter>
          <KeyHint keys="↑↓" label="move" />
          <KeyHint keys="enter" label="open" />
          <KeyHint keys="r" label="check again" />
          <PanelButton tone="neutral" onClick={recheck}>
            ↻  Check again
          </PanelButton>
        </PanelFooter>
      </div>
    );
  }

  return (
    <section aria-label="Update panel" className="glass mx-auto w-full max-w-4xl overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-surface-border bg-surface/60 px-5 py-3 text-sm sm:px-8">
        <p className="flex min-w-0 items-center gap-2 truncate">
          <span aria-hidden className="text-sky-500">
            ◆
          </span>
          <button
            type="button"
            onClick={() => view.screen !== "update" && backToList()}
            className="font-semibold tracking-wide text-foreground"
          >
            HOME SERVER
          </button>
          {crumbs.map((crumb, index) => (
            <span key={crumb} className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="text-muted">
                ›
              </span>
              <span className={`truncate ${index === 1 ? "text-sky-500" : "text-foreground/80"}`}>{crumb}</span>
            </span>
          ))}
        </p>
        <p className="shrink-0 text-muted tabular-nums">
          {info && <span className="hidden sm:inline">{`${info.user}@${info.host}`}&nbsp;&nbsp;&nbsp;</span>}
          <span className="text-foreground">{now !== null ? formatClock(now * 1000) : ""}</span>
        </p>
      </div>
      <div className="px-5 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-6">{body}</div>
    </section>
  );
}
