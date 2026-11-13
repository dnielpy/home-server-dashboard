"use client";

import { useEffect, useState } from "react";

import { Card, CardUnavailable } from "@/components/dashboard/card";
import { GitBranchIcon } from "@/components/icons/git-branch-icon";
import { ServerIcon } from "@/components/icons/server-icon";
import { AgentRequestError, callAgent, projectPath, useKeys } from "@/components/management/agent-client";
import {
  Callout,
  CommitSubject,
  KeyHint,
  PanelButton,
  PanelFooter,
  PanelSection,
  ProjectBadge,
  Spinner,
} from "@/components/management/parts";
import type { Commit, ProjectDetail } from "@/lib/api";
import { formatAgo, formatCommitDate } from "@/lib/format";

const POLL_MS = 1_000;

function CommitCard({ title, accent, commit, now }: {
  title: string;
  accent: "sky" | "violet";
  commit: Commit;
  now: number | null;
}) {
  return (
    <Card title={title} Icon={accent === "sky" ? ServerIcon : GitBranchIcon} accent={accent}>
      <div className="flex flex-1 flex-col justify-end gap-1">
        <p className="text-lg font-semibold text-foreground tabular-nums">{formatCommitDate(commit.epoch)}</p>
        <p className="text-sm text-muted tabular-nums">
          {now !== null && formatAgo(commit.epoch, now)}
          <span aria-hidden> · </span>
          <span className="font-mono text-amber-600 dark:text-amber-400">{commit.hash}</span>
        </p>
        <p className="truncate text-sm text-muted" title={commit.subject}>
          {commit.subject}
        </p>
      </div>
    </Card>
  );
}

function GithubCard({ detail, ready, now }: { detail: ProjectDetail | null; ready: boolean; now: number | null }) {
  if (detail?.remote && ready && detail.fetch !== "err") {
    return <CommitCard title="GitHub" accent="violet" commit={detail.remote} now={now} />;
  }
  let body;
  if (!ready || !detail) {
    body = (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner className="h-3.5 w-3.5 text-sky-500" />
        asking GitHub…
      </p>
    );
  } else if (detail.fetch === "err") {
    body = (
      <>
        <p className="font-semibold text-red-600 dark:text-red-400">No connection</p>
        <p className="text-sm text-muted">Could not reach the repo</p>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-sm text-muted">No remote branch</p>
        <p className="text-sm text-muted/70">The branch does not follow GitHub</p>
      </>
    );
  }
  return (
    <Card title="GitHub" Icon={GitBranchIcon} accent="violet">
      <div className="flex flex-1 flex-col justify-end gap-1">{body}</div>
    </Card>
  );
}

function Timeline({ commits, now }: { commits: ProjectDetail["commits"]; now: number | null }) {
  return (
    <ol className="flex flex-col">
      {commits.map((commit, index) => (
        <li key={commit.hash} className="relative flex gap-4 pb-4 last:pb-0">
          {index < commits.length - 1 && (
            <span aria-hidden className="absolute top-4 bottom-0 left-[5px] w-px bg-surface-border" />
          )}
          <span
            aria-hidden
            className={`mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ${
              index === 0 ? "bg-sky-500 ring-sky-500/15" : "bg-amber-500 ring-amber-500/15"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm">
                <span className="mr-2.5 font-mono text-amber-600 dark:text-amber-400">{commit.hash}</span>
                <CommitSubject subject={commit.subject} />
              </p>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {now !== null && formatAgo(commit.epoch, now)}
              </span>
            </div>
            <p className="text-xs text-muted">{commit.author}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function EmptyState({ tone, glyph, title, text }: { tone: "emerald" | "sky"; glyph: string; title: string; text: string }) {
  const box =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400"
      : "bg-sky-500/10 text-sky-600 ring-sky-500/25 dark:text-sky-400";
  return (
    <div className="flex items-center justify-center gap-4 py-6">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl ring-1 ring-inset ${box}`}>
        {glyph}
      </span>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
    </div>
  );
}

/** The second screen of home-server.sh: the project on the server against GitHub, and what an update brings. */
export function ProjectDetailView({
  name,
  now,
  onBack,
  onUpdate,
}: {
  name: string;
  now: number | null;
  onBack: () => void;
  onUpdate: () => void;
}) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  // The fetch started on opening it has ended, as the script waits for before enabling the buttons
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const next = await callAgent<ProjectDetail>(projectPath(name), "GET", controller.signal);
        setDetail(next);
        setError(null);
        if (next.fetch !== "pending") {
          setReady(true);
          return;
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof AgentRequestError ? err.message : "Could not load the project");
      }
      timer = setTimeout(poll, POLL_MS);
    }

    callAgent(projectPath(name, "/fetch"), "POST", controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) poll();
      });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [name]);

  useKeys((key) => {
    if (key === "left" || key === "up") setSelected(0);
    else if (key === "right" || key === "l" || key === "down") setSelected(1);
    else if (key === "back") onBack();
    else if (key === "enter" && ready) {
      if (selected === 1) onBack();
      else onUpdate();
    }
  });

  const deployed = detail?.service.deployed !== false;
  const commits = detail?.commits ?? [];
  const label = !deployed ? "▶  Deploy" : commits.length === 0 ? "↻  Redeploy" : "↻  Update";

  let body = null;
  if (!ready) {
    body = (
      <p className="flex items-center justify-center gap-2.5 py-6 text-sm text-muted">
        <Spinner className="h-4 w-4 text-sky-500" />
        Looking for new commits on GitHub…
      </p>
    );
  } else if (detail && detail.fetch !== "err" && detail.has_upstream) {
    if (!deployed) {
      body = (
        <EmptyState tone="sky" glyph="▶" title="Not deployed" text="It has no containers: press Deploy to create them." />
      );
    } else if (commits.length === 0) {
      body = (
        <EmptyState tone="emerald" glyph="✓" title="Up to date" text="The server already has the latest from GitHub." />
      );
    } else {
      body = (
        <div className="flex flex-col gap-4">
          <PanelSection title="Commits to update" aside={commits.length === 1 ? "1 commit" : `${commits.length} commits`} />
          <Timeline commits={commits} now={now} />
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-2xl font-semibold tracking-tight text-foreground">{name}</h3>
          {detail && <ProjectBadge project={ready ? detail : { ...detail, fetch: "pending" }} />}
        </div>
        <p className="truncate text-sm text-muted">
          <span className="font-mono">{detail?.path ?? " "}</span>
          {detail?.branch && (
            <>
              <span aria-hidden> · </span>
              branch <span className="font-medium text-violet-600 dark:text-violet-400">{detail.branch}</span>
            </>
          )}
        </p>
      </div>

      {error && !detail ? (
        <CardUnavailable message={error} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {detail?.head ? (
              <CommitCard title="Server" accent="sky" commit={detail.head} now={now} />
            ) : (
              <div className="glass shimmer min-h-44 rounded-3xl" />
            )}
            <GithubCard detail={detail} ready={ready} now={now} />
          </div>

          {ready && detail && (detail.fetch === "err" || detail.dirty || detail.ahead > 0) && (
            <div className="flex flex-col gap-2">
              {detail.fetch === "err" && <Callout tone="red">Could not reach GitHub: {detail.fetch_error}</Callout>}
              {detail.dirty && (
                <Callout tone="amber">There are uncommitted changes on the server; the pull can fail.</Callout>
              )}
              {detail.ahead > 0 && (
                <Callout tone="amber">
                  The server has {detail.ahead} {detail.ahead === 1 ? "commit" : "commits"} that are not on GitHub.
                </Callout>
              )}
            </div>
          )}

          {body}
        </>
      )}

      <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
        <PanelButton tone="primary" selected={ready && selected === 0} disabled={!ready} onClick={onUpdate}>
          {label}
        </PanelButton>
        <PanelButton tone="neutral" selected={ready && selected === 1} onClick={onBack}>
          ←  Back
        </PanelButton>
      </div>

      <PanelFooter>
        <KeyHint keys="←→" label="choose" />
        <KeyHint keys="enter" label="confirm" />
        <KeyHint keys="esc" label="back" />
      </PanelFooter>
    </div>
  );
}
