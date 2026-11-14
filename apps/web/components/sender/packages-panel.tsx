"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { DownloadIcon } from "@/components/icons/download-icon";
import { PackageIcon } from "@/components/icons/package-icon";
import { Callout, Spinner } from "@/components/management/parts";
import { callSender, downloadUrl, SenderRequestError } from "@/components/sender/sender-client";
import { useSenderRefresh } from "@/components/sender/sender-refresh";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import type { SenderFile, SenderPackage, SenderUnlock } from "@/lib/api";
import { formatBytes, formatSince } from "@/lib/format";
import { serverNow } from "@/lib/server-clock";

// The list keeps up with packages sent from other devices; an open package follows its downloads closely
const LIST_POLL_MS = 10_000;
const FILES_POLL_MS = 2_000;
// The second press that confirms deleting a package has to come within this long
const CONFIRM_MS = 3_000;

type Opened = { id: string; token: string; files: SenderFile[] };

function message(error: unknown): string {
  return error instanceof SenderRequestError ? error.message : "Something went wrong";
}

/** The packages waiting on the server; one opens with its PIN to download its files. */
export function PackagesPanel() {
  const { sent: refreshKey } = useSenderRefresh();
  const [packages, setPackages] = useState<SenderPackage[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // The package asking for its PIN, and the one whose files are showing
  const [asking, setAsking] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const list = await callSender<SenderPackage[]>("packages", "GET", undefined, signal);
      setPackages(list);
      setListError(null);
      return list;
    } catch (err) {
      if (signal?.aborted) return null;
      setListError(message(err));
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      await load(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, LIST_POLL_MS);
    }

    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load, refreshKey]);

  // While a package is open, which of its files have been downloaded; it is gone from the server after the last one
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    const { id, token } = opened;
    const poll = async () => {
      try {
        const files = await callSender<SenderFile[]>(`packages/${id}/files?${new URLSearchParams({ token })}`, "GET", undefined, controller.signal);
        setOpened((current) => (current?.id === id ? { ...current, files } : current));
      } catch (err) {
        if (controller.signal.aborted || !(err instanceof SenderRequestError) || err.status === 0) return;
        const list = await load();
        setOpened(null);
        if (list && list.some((p) => p.id === id)) {
          setNotice("The package closed after half an hour. Enter its PIN again.");
          setAsking(id);
        } else {
          setNotice("Every file was downloaded, so the package was deleted from the server.");
        }
      }
    };
    const timer = setInterval(poll, FILES_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [opened?.id, opened?.token, load]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setNotice(null);
    if (opened?.id === id) {
      setOpened(null);
      return;
    }
    setOpened(null);
    setAsking((current) => (current === id ? null : id));
  }

  return (
    <Panel
      id="sender-packages"
      title="Packages"
      subtitle={packages ? `${packages.length} waiting to be opened` : "Waiting to be opened"}
      Icon={PackageIcon}
      accent="violet"
    >
      <div className="flex flex-col gap-3">
        {notice && <Callout tone="amber">{notice}</Callout>}
        {listError && <Callout tone="red">{listError}</Callout>}
        {packages === null && !listError && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-3.5 w-3.5 text-violet-500" /> Loading…
          </p>
        )}
        {packages?.length === 0 && <PanelEmpty height={160}>No packages. Add one with New package.</PanelEmpty>}
        {packages && packages.length > 0 && (
          <ul className="flex flex-col gap-2">
            {packages.map((pkg) => (
              <li key={pkg.id} className="glass overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => toggle(pkg.id)}
                  aria-expanded={asking === pkg.id || opened?.id === pkg.id}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-hover"
                >
                  <span className="bg-accent-soft text-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                    <PackageIcon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{pkg.name}</span>
                    <span className="block text-xs text-muted tabular-nums">
                      {pkg.file_count} {pkg.file_count === 1 ? "file" : "files"} · {formatBytes(pkg.total_bytes)} ·{" "}
                      {formatSince(pkg.created_at, serverNow())}
                    </span>
                  </span>
                </button>
                {asking === pkg.id && (
                  <PinForm
                    packageId={pkg.id}
                    onUnlocked={(unlocked) => {
                      setAsking(null);
                      setNotice(null);
                      setOpened({ id: pkg.id, token: unlocked.token, files: unlocked.files });
                    }}
                  />
                )}
                {opened?.id === pkg.id && (
                  <OpenedPackage
                    opened={opened}
                    onDeleted={() => {
                      setOpened(null);
                      setNotice(`${pkg.name} was deleted from the server.`);
                      load();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function PinForm({ packageId, onUnlocked }: { packageId: string; onUnlocked: (unlocked: SenderUnlock) => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock(event?: FormEvent) {
    event?.preventDefault();
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await callSender<SenderUnlock>(`packages/${packageId}/unlock`, "POST", { pin }));
    } catch (err) {
      setError(message(err));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={unlock} className="flex flex-col gap-2 border-t border-surface-border px-4 py-3">
      <div className="flex items-center gap-2">
        <input
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-label="PIN"
          placeholder="PIN"
          className="glass w-32 rounded-xl px-3 py-2 text-sm tracking-[0.4em] text-foreground tabular-nums outline-none placeholder:tracking-normal focus:ring-2 focus:ring-violet-500/50"
        />
        <button
          type="submit"
          disabled={pin.length !== 4 || busy}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {busy && <Spinner className="h-3.5 w-3.5" />}
          Open
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

function OpenedPackage({ opened, onDeleted }: { opened: Opened; onDeleted: () => void }) {
  // The files whose download started here, until the server says it went out whole
  const [started, setStarted] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
      return;
    }
    clearTimeout(confirmTimer.current);
    setDeleting(true);
    try {
      await callSender(`packages/${opened.id}?${new URLSearchParams({ token: opened.token })}`, "DELETE");
      onDeleted();
    } catch (err) {
      setError(message(err));
      setDeleting(false);
      setConfirming(false);
    }
  }

  const left = opened.files.filter((file) => !file.downloaded).length;

  return (
    <div className="flex flex-col gap-2 border-t border-surface-border px-4 py-3">
      <ul className="flex flex-col gap-1">
        {opened.files.map((file) => (
          <li key={file.id} className="flex items-center gap-3 rounded-xl py-1.5">
            <span
              className={`min-w-0 flex-1 truncate text-sm ${file.downloaded ? "text-muted line-through" : "text-foreground"}`}
              title={file.name}
            >
              {file.name}
            </span>
            <span className="shrink-0 text-xs text-muted tabular-nums">{formatBytes(file.size)}</span>
            {file.downloaded ? (
              <span className="w-24 shrink-0 text-right text-xs text-emerald-600 dark:text-emerald-400">✓ Downloaded</span>
            ) : (
              <a
                href={downloadUrl(opened.id, file.id, opened.token)}
                download={file.name}
                onClick={() => setStarted((current) => new Set(current).add(file.id))}
                className="inline-flex w-24 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-500/30 ring-inset transition hover:bg-violet-500/15 dark:text-violet-300"
              >
                {started.has(file.id) ? <Spinner className="h-3 w-3" /> : <DownloadIcon className="h-3.5 w-3.5" />}
                {started.has(file.id) ? "Again" : "Download"}
              </a>
            )}
          </li>
        ))}
      </ul>
      {error && <Callout tone="red">{error}</Callout>}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted">
          {left} left · deleted from the server once every file is downloaded
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 ring-1 ring-red-500/30 ring-inset transition hover:bg-red-500/15 disabled:opacity-40 dark:text-red-400"
        >
          {deleting && <Spinner className="h-3 w-3" />}
          {confirming ? "Press again to delete" : "Delete"}
        </button>
      </div>
    </div>
  );
}
