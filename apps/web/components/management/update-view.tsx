"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CardUnavailable } from "@/components/dashboard/card";
import { AgentRequestError, callAgent, projectPath, useKeys } from "@/components/management/agent-client";
import { Callout, KeyHint, PanelButton, PanelFooter, Spinner } from "@/components/management/parts";
import type { UpdateJob } from "@/lib/api";
import { formatDuration, formatStopwatch } from "@/lib/format";

const POLL_MS = 1_000;
const RECONNECT_MS = 2_000;
// The second press that confirms a cancel has to come within this long, like the script's double Ctrl+C
const CANCEL_CONFIRM_MS = 3_000;
const OUTPUT_LINES = 16;

type Job = Omit<UpdateJob, "lines">;

function succeeded(job: Job): boolean {
  return !job.running && job.code === 0 && !job.cancelled;
}

function ProgressBar({ job }: { job: Job }) {
  const total = Math.max(job.expected_steps.length, job.steps.length, 1);
  const done = succeeded(job) ? total : Math.max(job.steps.length - 1, 0);
  const filled = (done / total) * 100;
  const current = succeeded(job) ? 0 : (1 / total) * 100;
  const currentTone = job.running
    ? "shimmer bg-sky-400/35"
    : job.cancelled
      ? "bg-amber-400"
      : "bg-red-500";

  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-track">
      <div
        className="absolute inset-0 bg-linear-to-r from-cyan-400 via-blue-500 to-violet-500 transition-[clip-path] duration-700"
        style={{ clipPath: `inset(0 ${100 - filled}% 0 0)` }}
      />
      {current > 0 && (
        <div
          className={`absolute inset-y-0 transition-all duration-700 ${currentTone}`}
          style={{ left: `${filled}%`, width: `${current}%` }}
        />
      )}
    </div>
  );
}

function Steps({ job, now }: { job: Job; now: number }) {
  const total = Math.max(job.expected_steps.length, job.steps.length);
  const last = job.steps.length - 1;

  return (
    <ol className="flex flex-col gap-2.5">
      {Array.from({ length: total }, (_, index) => {
        const step = job.steps[index];
        const label = step?.label ?? job.expected_steps[index];
        let icon;
        let tone = "text-muted";
        let duration: string | null = null;
        if (step) duration = formatDuration((step.finished_at ?? now) - step.started_at);

        if (index < last || (index === last && succeeded(job))) {
          icon = <span className="text-emerald-500">✓</span>;
          tone = "text-foreground/80";
        } else if (index === last && job.running) {
          icon = <Spinner className="h-3.5 w-3.5 text-sky-500" />;
          tone = "font-semibold text-foreground";
        } else if (index === last && job.cancelled) {
          icon = <span className="text-amber-500">■</span>;
          tone = "text-amber-600 dark:text-amber-400";
        } else if (index === last) {
          icon = <span className="text-red-500">✗</span>;
          tone = "text-red-600 dark:text-red-400";
        } else {
          icon = <span className="text-muted/60">○</span>;
          tone = "text-muted/70";
        }

        return (
          <li key={index} className="flex items-center gap-4 px-2 text-sm">
            <span className="flex w-4 justify-center">{icon}</span>
            <span className={`flex-1 ${tone}`}>{label}</span>
            {duration && (
              <span
                className={`text-xs tabular-nums ${index === last && job.running ? "text-sky-500" : "text-muted"}`}
              >
                {duration}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Result({ job }: { job: Job }) {
  const elapsed = formatDuration((job.finished_at ?? job.started_at) - job.started_at);
  const lastStep = job.steps.at(-1)?.label;
  let style;
  let title;
  let text;
  if (job.cancelled) {
    style = "border-amber-500/40 bg-amber-500/5";
    title = <span className="text-amber-600 dark:text-amber-400">■ Cancelled halfway</span>;
    text = "Check the state of the containers before going on.";
  } else if (job.code === 0) {
    style = "border-emerald-500/40 bg-emerald-500/5";
    title = (
      <span className="text-emerald-600 dark:text-emerald-400">
        ✓ {job.first_deploy ? "Deployed for the first time" : "Updated and redeployed"}
      </span>
    );
    text = (
      <>
        in <span className="text-foreground">{elapsed}</span> · now on{" "}
        <span className="font-mono text-amber-600 dark:text-amber-400">{job.hash}</span>
      </>
    );
  } else {
    style = "border-red-500/40 bg-red-500/5";
    title = <span className="text-red-600 dark:text-red-400">✗ Something went wrong</span>;
    text =
      job.code === null
        ? "update.sh stopped without an exit code"
        : lastStep
          ? `in «${lastStep}» · code ${job.code}`
          : `update.sh exited with code ${job.code}`;
  }
  return (
    <div className={`rounded-2xl border px-5 py-4 ${style}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 pl-5 text-sm text-muted tabular-nums">{text}</p>
    </div>
  );
}

function Output({ lines, full, onToggle }: { lines: string[]; full: boolean; onToggle: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const shown = full ? lines : lines.slice(-OUTPUT_LINES);
  const first = lines.length - shown.length;

  // Follows the end of the log, unless it was scrolled up to read something
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 80) element.scrollTop = element.scrollHeight;
  }, [lines.length, full]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-inner">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2 text-xs text-zinc-400">
        <span className="font-medium tracking-wide">output</span>
        <button type="button" onClick={onToggle} className="rounded-md px-2 py-0.5 hover:bg-white/8 hover:text-zinc-200">
          {full ? "Last lines" : `Full log · ${lines.length} lines`}
        </button>
      </div>
      <div
        ref={box}
        className={`overflow-auto px-4 py-3 font-mono text-xs leading-5 ${full ? "max-h-[32rem]" : "min-h-[20rem]"}`}
      >
        {shown.length === 0 ? (
          <p className="text-zinc-500">waiting for output…</p>
        ) : (
          shown.map((line, index) => (
            <p
              key={first + index}
              className={`whitespace-pre-wrap break-all ${
                first + index === lines.length - 1 ? "text-zinc-100" : "text-zinc-500"
              }`}
            >
              {line}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

/** The third screen of home-server.sh: runs the project's update.sh on the server and follows it. */
export function UpdateView({
  name,
  start,
  now,
  onDone,
}: {
  name: string;
  /** False to follow an update that is already running. */
  start: boolean;
  now: number | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  // The agent's clock minus the browser's, so the elapsed time does not depend on the browser being right
  const [clockOffset, setClockOffset] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [fullLog, setFullLog] = useState(false);
  const finished = job !== null && !job.running;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let offset = 0;
    let seen = false;

    function apply(next: UpdateJob) {
      seen = true;
      setJob(next);
      setClockOffset(next.now - Date.now() / 1000);
      // The lines start where they were asked from
      const from = next.offset - next.lines.length;
      if (next.lines.length > 0) setLines((previous) => [...previous.slice(0, from), ...next.lines]);
      offset = next.offset;
    }

    async function poll() {
      try {
        const next = await callAgent<UpdateJob>(projectPath(name, `/update?offset=${offset}`), "GET", signal);
        apply(next);
        setReconnecting(false);
        if (!next.running && next.offset >= next.total_lines) return;
        timer = setTimeout(poll, next.offset < next.total_lines ? 0 : POLL_MS);
      } catch (err) {
        if (signal.aborted) return;
        if (!seen && err instanceof AgentRequestError && err.status === 404) {
          setFatal(err.message);
          return;
        }
        // Updating the dashboard itself takes this page's server down for a while
        setReconnecting(true);
        timer = setTimeout(poll, RECONNECT_MS);
      }
    }

    async function begin() {
      if (start) {
        try {
          apply(await callAgent<UpdateJob>(projectPath(name, "/update"), "POST", signal));
        } catch (err) {
          if (signal.aborted) return;
          const busy = err instanceof AgentRequestError && err.status === 409 && err.message.includes("already updating");
          if (!busy) {
            setFatal(err instanceof Error ? err.message : "Could not start the update");
            return;
          }
        }
      }
      poll();
    }

    begin();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [name, start]);

  // The status cards at the top show the new containers
  useEffect(() => {
    if (finished) router.refresh();
  }, [finished, router]);

  useEffect(() => {
    if (!cancelArmed) return;
    const id = setTimeout(() => setCancelArmed(false), CANCEL_CONFIRM_MS);
    return () => clearTimeout(id);
  }, [cancelArmed]);

  async function cancel() {
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    setCancelArmed(false);
    try {
      // Only the state: the lines keep coming from the poll
      setJob(await callAgent<UpdateJob>(projectPath(name, "/update/cancel"), "POST"));
    } catch {
      // It ended on its own in between; the poll shows how
    }
  }

  useKeys((key) => {
    if (fatal && (key === "enter" || key === "back")) onDone();
    else if (finished && (key === "enter" || key === "back")) onDone();
    else if (finished && key === "l") setFullLog((full) => !full);
  });

  if (fatal) {
    return (
      <div className="flex flex-col gap-6">
        <CardUnavailable message={fatal} />
        <div className="flex justify-center">
          <PanelButton tone="neutral" selected onClick={onDone}>
            ←  Back to panel
          </PanelButton>
        </div>
      </div>
    );
  }

  const serverNow = now === null ? null : now + clockOffset;
  const elapsed = job ? (job.finished_at ?? serverNow ?? job.started_at) - job.started_at : 0;
  const first = job?.first_deploy ?? false;
  let heading;
  if (!job || job.running) {
    heading = (
      <>
        <Spinner className="h-4 w-4 text-sky-500" />
        {first ? "Deploying" : "Updating"} {name}
      </>
    );
  } else if (job.cancelled) {
    heading = (
      <>
        <span className="text-amber-500">■</span>
        {first ? "Deploy cancelled" : "Update cancelled"}
      </>
    );
  } else if (job.code === 0) {
    heading = (
      <>
        <span className="text-emerald-500">✓</span>
        {name} {first ? "deployed" : "updated"}
      </>
    );
  } else {
    heading = (
      <>
        <span className="text-red-500">✗</span>
        {first ? "The deploy failed" : "The update failed"}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-3 text-xl font-semibold tracking-tight text-foreground">{heading}</h3>
        <span className="font-mono text-sm text-muted tabular-nums">{formatStopwatch(elapsed)}</span>
      </div>

      {job ? (
        <>
          <ProgressBar job={job} />
          <Steps job={job} now={serverNow ?? job.started_at} />
        </>
      ) : (
        <div className="shimmer h-2 rounded-full bg-track" />
      )}

      {reconnecting && (
        <Callout tone="amber">
          <span className="inline-flex items-center gap-2">
            <Spinner className="h-3 w-3 text-amber-500" />
            Lost the connection to the server. When the dashboard itself is updating it comes back on its own;
            reconnecting…
          </span>
        </Callout>
      )}

      {job && finished && <Result job={job} />}

      <Output lines={lines} full={fullLog} onToggle={() => setFullLog((full) => !full)} />

      <PanelFooter>
        {finished ? (
          <>
            <PanelButton tone="neutral" selected onClick={onDone}>
              ←  Back to panel
            </PanelButton>
            <KeyHint keys="enter" label="back to panel" />
            <KeyHint keys="l" label="full log" />
          </>
        ) : (
          <>
            <PanelButton tone="danger" disabled={!job} onClick={cancel}>
              {cancelArmed ? "Press again to cancel" : "■  Cancel"}
            </PanelButton>
            {cancelArmed && <span className="text-xs text-red-500">The containers can be left stopped</span>}
          </>
        )}
      </PanelFooter>
    </div>
  );
}
