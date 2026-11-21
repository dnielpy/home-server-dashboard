"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { DownloadIcon } from "@/components/icons/download-icon";
import { FileIcon } from "@/components/icons/file-icon";
import { FolderIcon } from "@/components/icons/folder-icon";
import { RefreshIcon } from "@/components/icons/refresh-icon";
import { Callout, Spinner } from "@/components/management/parts";
import { Meter } from "@/components/ui/meter";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import type { FileEntry, Folder } from "@/lib/api";
import { formatBytes } from "@/lib/format";

// The second press that confirms deleting has to come within this long
const CONFIRM_MS = 3_000;

const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition disabled:pointer-events-none disabled:opacity-40";
const BUTTON_TONES = {
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/30 hover:bg-violet-500/15 dark:text-violet-300",
  neutral: "bg-surface text-foreground ring-surface-border hover:bg-surface-hover",
  red: "bg-red-500/10 text-red-600 ring-red-500/30 hover:bg-red-500/15 dark:text-red-400",
};
const INPUT =
  "min-w-0 flex-1 rounded-lg bg-surface px-2.5 py-1 text-sm text-foreground ring-1 ring-surface-border outline-none ring-inset focus:ring-violet-500/60";

const modifiedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

class FilesRequestError extends Error {}

async function callFiles<T>(action: string, params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/files${action}?${new URLSearchParams(params)}`, { method, cache: "no-store" });
  } catch {
    throw new FilesRequestError("Could not reach the dashboard");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new FilesRequestError(body?.detail ?? `The dashboard answered ${response.status}`);
  return body as T;
}

function message(error: unknown): string {
  return error instanceof FilesRequestError ? error.message : "Something went wrong";
}

function join(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

function folderHref(path: string): string {
  return path ? `/files?${new URLSearchParams({ path })}` : "/files";
}

/** A file manager for the external disk: open folders, download, rename and delete what is in them. */
export function FilesExplorer() {
  const router = useRouter();
  const path = useSearchParams().get("path") ?? "";
  const [folder, setFolder] = useState<Folder | null>(null);
  // While Refresh, or an action, reads the folder again
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  // Another folder starts without the last one's filter or new folder
  const [openPath, setOpenPath] = useState(path);
  if (openPath !== path) {
    setOpenPath(path);
    setFilter("");
    setCreating(false);
  }

  const load = useCallback(async (signal?: { aborted: boolean }) => {
    try {
      const next = await callFiles<Folder>("", { path });
      if (signal?.aborted) return;
      setFolder(next);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(message(err));
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, [path]);

  const reload = () => {
    setRefreshing(true);
    load();
  };

  useEffect(() => {
    const signal = { aborted: false };
    async function read() {
      await load(signal);
    }
    read();
    return () => {
      signal.aborted = true;
    };
  }, [load]);

  const open = (next: string) => router.push(folderHref(next));
  const parts = path ? path.split("/") : [];
  // What is on screen belongs to the folder asked for, not to the one before it
  const shown = folder && folder.path === path ? folder : null;
  const needle = filter.trim().toLocaleLowerCase();
  const entries = shown?.entries.filter((entry) => entry.name.toLocaleLowerCase().includes(needle)) ?? [];
  const used = shown ? shown.disk.total - shown.disk.free : 0;

  return (
    <Panel
      id="files"
      title={parts.at(-1) ?? "External disk"}
      subtitle={
        shown
          ? `${shown.entries.length} ${shown.entries.length === 1 ? "item" : "items"} · ${formatBytes(shown.disk.free)} free of ${formatBytes(shown.disk.total)}`
          : "On the server"
      }
      Icon={FolderIcon}
      accent="violet"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => open(parts.slice(0, -1).join("/"))}
            disabled={parts.length === 0}
            className={`${BUTTON} ${BUTTON_TONES.neutral}`}
          >
            ↑ Up
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={!shown}
            className={`${BUTTON} ${BUTTON_TONES.violet}`}
          >
            + New folder
          </button>
          <button
            type="button"
            onClick={reload}
            aria-label="Refresh"
            title="Refresh"
            className={`${BUTTON} ${BUTTON_TONES.neutral}`}
          >
            {refreshing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshIcon className="h-3.5 w-3.5" />}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <nav aria-label="Folder" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <Link href={folderHref("")} className="rounded-md px-1.5 py-0.5 text-muted transition hover:bg-surface-hover hover:text-foreground">
            Disk
          </Link>
          {parts.map((part, index) => (
            <span key={index} className="flex min-w-0 items-center gap-1">
              <span aria-hidden className="text-muted/60">
                /
              </span>
              {index === parts.length - 1 ? (
                <span aria-current="page" className="truncate px-1.5 py-0.5 font-medium text-foreground">
                  {part}
                </span>
              ) : (
                <Link
                  href={folderHref(parts.slice(0, index + 1).join("/"))}
                  className="truncate rounded-md px-1.5 py-0.5 text-muted transition hover:bg-surface-hover hover:text-foreground"
                >
                  {part}
                </Link>
              )}
            </span>
          ))}
        </nav>

        {shown && <Meter percent={shown.disk.total ? (used / shown.disk.total) * 100 : 0} className="h-1" />}

        {shown && shown.entries.length > 8 && (
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
            placeholder="Filter this folder…"
            aria-label="Filter this folder"
            className={`${INPUT} py-1.5`}
          />
        )}

        {error && <Callout tone="red">{error}</Callout>}
        {!shown && !error && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-3.5 w-3.5 text-violet-500" /> Loading…
          </p>
        )}

        {creating && shown && (
          <NewFolderRow
            folder={path}
            onDone={(created) => {
              setCreating(false);
              if (created) reload();
            }}
          />
        )}

        {shown && shown.entries.length === 0 && !creating && <PanelEmpty height={160}>This folder is empty.</PanelEmpty>}
        {shown && shown.entries.length > 0 && entries.length === 0 && (
          <PanelEmpty height={120}>Nothing here is called “{filter.trim()}”.</PanelEmpty>
        )}
        {entries.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {entries.map((entry) => (
              <EntryRow key={entry.name} folder={path} entry={entry} onOpen={open} onChanged={reload} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function EntryRow({
  folder,
  entry,
  onOpen,
  onChanged,
}: {
  folder: string;
  entry: FileEntry;
  onOpen: (path: string) => void;
  onChanged: () => void;
}) {
  const path = join(folder, entry.name);
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
    setBusy(true);
    setError(null);
    try {
      await callFiles("/delete", { path }, "POST");
      onChanged();
    } catch (err) {
      setError(message(err));
      setBusy(false);
      setConfirming(false);
    }
  }

  async function rename(name: string) {
    if (name.trim() === entry.name || !name.trim()) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callFiles("/rename", { path, name: name.trim() }, "POST");
      setRenaming(false);
      onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const isFolder = entry.kind === "folder";
  const details = [
    isFolder ? "Folder" : formatBytes(entry.size ?? 0),
    modifiedFormat.format(new Date(entry.modified * 1000)),
    entry.link ? "link" : null,
  ].filter(Boolean);

  return (
    <li className={`glass flex flex-col gap-2 rounded-2xl px-3 py-2.5 sm:px-4 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isFolder ? "bg-violet-500/12 text-violet-600 dark:text-violet-300" : "bg-surface text-muted"
          }`}
        >
          {isFolder ? <FolderIcon className="h-4.5 w-4.5" /> : <FileIcon className="h-4.5 w-4.5" />}
        </span>
        <span className="min-w-0 flex-1 basis-40">
          {renaming ? (
            <RenameInput name={entry.name} busy={busy} onSave={rename} onCancel={() => setRenaming(false)} />
          ) : isFolder ? (
            <button
              type="button"
              onClick={() => onOpen(path)}
              title={entry.name}
              className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
            >
              {entry.name}
            </button>
          ) : (
            <span className="block truncate text-sm font-medium text-foreground" title={entry.name}>
              {entry.name}
            </span>
          )}
          <span className="block truncate text-xs text-muted tabular-nums">
            {details.join(" · ")}
            {entry.protected && " · used by an app"}
          </span>
        </span>
        {!renaming && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <a
              href={`/api/files/download?${new URLSearchParams({ path })}`}
              download
              title={isFolder ? "Download it as a zip" : "Download"}
              className={`${BUTTON} ${BUTTON_TONES.violet}`}
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {isFolder ? "Zip" : "Download"}
            </a>
            {!entry.protected && (
              <>
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  disabled={busy}
                  className={`${BUTTON} ${BUTTON_TONES.neutral}`}
                >
                  Rename
                </button>
                <button type="button" onClick={remove} disabled={busy} className={`${BUTTON} ${BUTTON_TONES.red}`}>
                  {busy && confirming ? <Spinner className="h-3 w-3" /> : null}
                  {confirming ? (isFolder ? "Delete all inside?" : "Press again") : "Delete"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {error && <Callout tone="red">{error}</Callout>}
    </li>
  );
}

function RenameInput({
  name,
  busy,
  onSave,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.focus();
    // The name without its extension, as file managers do
    const dot = name.lastIndexOf(".");
    element.setSelectionRange(0, dot > 0 ? dot : name.length);
  }, [name]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") onCancel();
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <input
        ref={input}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
        aria-label="New name"
        maxLength={255}
        className={INPUT}
      />
      <button type="submit" disabled={busy} className={`${BUTTON} ${BUTTON_TONES.violet}`}>
        Save
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className={`${BUTTON} ${BUTTON_TONES.neutral}`}>
        Cancel
      </button>
    </form>
  );
}

function NewFolderRow({ folder, onDone }: { folder: string; onDone: (created: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(name: string) {
    if (!name.trim()) {
      onDone(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callFiles("/mkdir", { path: folder, name: name.trim() }, "POST");
      onDone(true);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl px-3 py-2.5 sm:px-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-300">
          <FolderIcon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <RenameInput name="New folder" busy={busy} onSave={create} onCancel={() => onDone(false)} />
        </span>
      </div>
      {error && <Callout tone="red">{error}</Callout>}
    </div>
  );
}
