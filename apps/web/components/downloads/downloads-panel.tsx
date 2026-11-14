"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DownloadIcon } from "@/components/icons/download-icon";
import { callDownloads, DownloadsRequestError, fileUrl } from "@/components/downloads/downloads-client";
import { useDownloadsRefresh } from "@/components/downloads/downloads-refresh";
import { Callout, Spinner } from "@/components/management/parts";
import { Meter } from "@/components/ui/meter";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import type { ServerDownload } from "@/lib/api";
import { formatBytes, formatElapsed, formatSince } from "@/lib/format";
import { serverNow } from "@/lib/server-clock";

// Close while something downloads, so the progress moves; slower when every download is still
const ACTIVE_POLL_MS = 1_500;
const IDLE_POLL_MS = 10_000;
// The second press that confirms deleting a download has to come within this long
const CONFIRM_MS = 3_000;

const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition disabled:opacity-40";
const BUTTON_TONES = {
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/30 hover:bg-violet-500/15 dark:text-violet-300",
  neutral: "bg-surface text-foreground ring-surface-border hover:bg-surface-hover",
  red: "bg-red-500/10 text-red-600 ring-red-500/30 hover:bg-red-500/15 dark:text-red-400",
};

function message(error: unknown): string {
  return error instanceof DownloadsRequestError ? error.message : "Something went wrong";
}

function isActive(download: ServerDownload): boolean {
  return download.state === "queued" || download.state === "downloading";
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The downloads the server has or is doing, and the file of each finished one for this device. */
export function DownloadsPanel() {
  const { added: refreshKey } = useDownloadsRefresh();
  const [downloads, setDownloads] = useState<ServerDownload[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const list = await callDownloads<ServerDownload[]>("", "GET", undefined, signal);
      setDownloads(list);
      setError(null);
      return list;
    } catch (err) {
      if (!signal?.aborted) setError(message(err));
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const list = await load(controller.signal);
      if (controller.signal.aborted) return;
      timer = setTimeout(poll, list && !list.some(isActive) ? IDLE_POLL_MS : ACTIVE_POLL_MS);
    }

    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load, refreshKey]);

  const active = downloads?.filter(isActive).length ?? 0;
  const done = downloads?.filter((d) => d.state === "done").length ?? 0;

  return (
    <Panel
      id="downloads"
      title="Downloads"
      subtitle={downloads ? `${active} in progress · ${done} ready` : "On the server"}
      Icon={DownloadIcon}
      accent="sky"
    >
      <div className="flex flex-col gap-3">
        {error && <Callout tone="red">{error}</Callout>}
        {downloads === null && !error && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-3.5 w-3.5 text-sky-500" /> Loading…
          </p>
        )}
        {downloads?.length === 0 && <PanelEmpty height={160}>No downloads. Add a link with Add download.</PanelEmpty>}
        {downloads && downloads.length > 0 && (
          <ul className="flex flex-col gap-2">
            {downloads.map((download) => (
              <DownloadRow
                key={download.id}
                download={download}
                onChanged={(changed) =>
                  changed === null
                    ? setDownloads((current) => current?.filter((d) => d.id !== download.id) ?? null)
                    : setDownloads((current) => current?.map((d) => (d.id === changed.id ? changed : d)) ?? null)
                }
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function DownloadRow({ download, onChanged }: { download: ServerDownload; onChanged: (changed: ServerDownload | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  async function act(action: "pause" | "resume") {
    setBusy(true);
    setError(null);
    try {
      onChanged(await callDownloads<ServerDownload>(`${download.id}/${action}`, "POST"));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
      return;
    }
    clearTimeout(confirmTimer.current);
    setBusy(true);
    setError(null);
    try {
      await callDownloads(download.id, "DELETE");
      onChanged(null);
    } catch (err) {
      setError(message(err));
      setBusy(false);
      setConfirming(false);
    }
  }

  const { state, size, received } = download;
  const percent = size ? (received / size) * 100 : 0;

  return (
    <li className="glass flex flex-col gap-2.5 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="bg-accent-soft text-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
          {state === "downloading" && !download.retry_at ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <DownloadIcon className="h-4.5 w-4.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground" title={download.name}>
            {download.name}
          </span>
          <span className="block truncate text-xs text-muted" title={download.url}>
            {host(download.url)} · {formatSince(download.created_at, serverNow())}
          </span>
        </span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {state === "done" && (
            <a href={fileUrl(download.id)} download={download.name} className={`${BUTTON} ${BUTTON_TONES.violet}`}>
              <DownloadIcon className="h-3.5 w-3.5" />
              Download
            </a>
          )}
          {isActive(download) && (
            <button type="button" onClick={() => act("pause")} disabled={busy} className={`${BUTTON} ${BUTTON_TONES.neutral}`}>
              Pause
            </button>
          )}
          {(state === "paused" || state === "failed") && (
            <button type="button" onClick={() => act("resume")} disabled={busy} className={`${BUTTON} ${BUTTON_TONES.neutral}`}>
              {state === "paused" ? "Resume" : "Retry"}
            </button>
          )}
          <button type="button" onClick={remove} disabled={busy} className={`${BUTTON} ${BUTTON_TONES.red}`}>
            {confirming ? "Press again" : "Delete"}
          </button>
        </div>
      </div>

      {state !== "done" && (
        <Meter
          percent={size ? percent : state === "downloading" ? 100 : 0}
          active={state === "downloading" && !download.retry_at}
          barClassName={state === "failed" ? "bg-red-500" : state === "paused" ? "bg-zinc-400" : undefined}
        />
      )}
      <Status download={download} percent={percent} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}

function Status({ download, percent }: { download: ServerDownload; percent: number }) {
  const { state, size, received, speed } = download;
  const amount = size ? `${formatBytes(received)} / ${formatBytes(size)} · ${Math.floor(percent)}%` : formatBytes(received);

  if (state === "done") {
    return (
      <p className="text-xs text-muted tabular-nums">
        <span className="text-emerald-600 dark:text-emerald-400">✓ On the server</span> · {formatBytes(received)}
        {download.finished_at && ` · finished ${formatSince(download.finished_at, serverNow())}`}
      </p>
    );
  }
  if (state === "failed") {
    return (
      <p className="text-xs text-muted tabular-nums">
        <span className="text-red-600 dark:text-red-400">{download.error ?? "Failed"}</span> · {amount} kept, Retry goes
        on from there
      </p>
    );
  }
  if (state === "paused") return <p className="text-xs text-muted tabular-nums">Paused · {amount}</p>;
  if (state === "queued") return <p className="text-xs text-muted tabular-nums">Waiting for another download · {amount}</p>;

  if (download.retry_at) {
    const seconds = Math.max(0, Math.ceil((new Date(download.retry_at).getTime() - serverNow()) / 1000));
    return (
      <p className="text-xs text-muted tabular-nums">
        <span className="text-amber-600 dark:text-amber-400">{download.error}</span> · retrying{" "}
        {seconds > 0 ? `in ${seconds} s` : "now"} (try {download.attempts + 1} of {download.max_attempts}) · {amount}
      </p>
    );
  }
  const left = size && speed > 0 ? ((size - received) / speed) * 1000 : null;
  return (
    <p className="text-xs text-muted tabular-nums">
      {amount}
      {speed > 0 ? ` · ${formatBytes(speed)}/s` : " · connecting…"}
      {left !== null && ` · ${formatElapsed(left)} left`}
    </p>
  );
}
