"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CardUnavailable } from "@/components/dashboard/card";
import { AgentRequestError, callAgent, projectPath } from "@/components/management/agent-client";
import { Callout, Spinner } from "@/components/management/parts";
import type { ContainerLogs } from "@/lib/api";
import { formatSince } from "@/lib/format";

const POLL_MS = 3_000;
const RETRY_MS = 5_000;
const TAIL = 500;

/** The last lines of each of a project's containers, read again every few seconds while it follows them. */
export function LogsView({ project }: { project: string }) {
  const [container, setContainer] = useState<string | null>(null);
  const [logs, setLogs] = useState<ContainerLogs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const query = new URLSearchParams({ tail: String(TAIL) });
      if (container) query.set("container", container);
      try {
        const next = await callAgent<ContainerLogs>(projectPath(project, `/logs?${query}`), "GET", controller.signal);
        setLogs(next);
        setError(null);
        if (following) timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof AgentRequestError ? err.message : "Could not read the logs");
        timer = setTimeout(poll, RETRY_MS);
      }
    }

    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [project, container, following]);

  const lines = logs?.lines ?? [];
  const shown = container ?? logs?.container ?? null;

  // Follows the end of the log, unless it was scrolled up to read something
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 80) element.scrollTop = element.scrollHeight;
  }, [logs]);

  if (!logs && error) {
    return (
      <div className="glass rounded-3xl p-6">
        <CardUnavailable message={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(logs?.containers ?? []).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setContainer(name)}
            aria-pressed={name === shown}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
              name === shown
                ? "bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/30 ring-inset dark:text-sky-300"
                : "glass text-muted hover:text-foreground"
            }`}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFollowing((value) => !value)}
          className="glass ml-auto inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover"
        >
          {following ? (
            <>
              <span aria-hidden className="pulse-dot h-1.5 w-1.5 text-emerald-500" />
              Following
            </>
          ) : (
            "▶  Follow"
          )}
        </button>
      </div>

      {error && <Callout tone="amber">Lost the connection, showing the last lines read. {error}</Callout>}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-inner">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2 text-xs text-zinc-400">
          <span className="font-medium tracking-wide">{shown ?? "logs"}</span>
          <span className="tabular-nums">{logs ? `last ${lines.length} lines` : ""}</span>
        </div>
        <div ref={box} className="h-[calc(100dvh-20rem)] min-h-80 overflow-auto px-4 py-3 font-mono text-xs leading-5">
          {!logs ? (
            <p className="flex items-center gap-2 text-zinc-500">
              <Spinner className="h-3 w-3" />
              reading the logs…
            </p>
          ) : logs.container === null ? (
            <p className="text-zinc-500">It has no containers.</p>
          ) : lines.length === 0 ? (
            <p className="text-zinc-500">The container has not written anything yet.</p>
          ) : (
            lines.map((line, index) => (
              <p key={index} className="whitespace-pre-wrap break-all text-zinc-300">
                {line.time && <span className="mr-3 text-zinc-600 select-none">{formatSince(line.time)}</span>}
                {line.text}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
