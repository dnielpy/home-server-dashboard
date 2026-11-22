"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { FileIcon } from "@/components/icons/file-icon";
import { FolderIcon } from "@/components/icons/folder-icon";
import { RefreshIcon } from "@/components/icons/refresh-icon";
import { Callout, Spinner } from "@/components/management/parts";
import { Meter } from "@/components/ui/meter";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import type { FileEntry, Folder } from "@/lib/api";
import { formatBytes } from "@/lib/format";

import { ActionsMenu } from "./actions-menu";
import { BUTTON, BUTTON_TONES, callFiles, downloadHref, folderHref, INPUT, join, message } from "./files-client";
import { FolderPicker, type PickerRequest, type PickerResult } from "./folder-picker";
import { Transfers } from "./transfers";

type Failure = PickerResult["failures"][number];

const modifiedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * A file manager for the external disk: open folders, download, rename, move, copy and delete what is in them, one at
 * a time or several selected together.
 */
export function FilesExplorer() {
  const router = useRouter();
  const path = useSearchParams().get("path") ?? "";
  const [folder, setFolder] = useState<Folder | null>(null);
  // While Refresh, or an action, reads the folder again
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  // The move or copy whose destination is being picked, and a count of the copies started, to read them again
  const [picking, setPicking] = useState<PickerRequest | null>(null);
  const [copiesStarted, setCopiesStarted] = useState(0);
  // The names checked in this folder, and what an action on them could not do
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<Failure[]>([]);
  // Another folder starts without the last one's filter, new folder or selection
  const [openPath, setOpenPath] = useState(path);
  if (openPath !== path) {
    setOpenPath(path);
    setFilter("");
    setCreating(false);
    setSelected(new Set());
    setFailures([]);
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
  // What is checked and still in the folder, after a reload
  const chosen = shown?.entries.filter((entry) => selected.has(entry.name)) ?? [];

  function toggle(name: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  function toggleAll() {
    const all = entries.every((entry) => selected.has(entry.name));
    setSelected((current) => {
      const next = new Set(current);
      for (const entry of entries) {
        if (all) next.delete(entry.name);
        else next.add(entry.name);
      }
      return next;
    });
  }

  function pick(mode: PickerRequest["mode"], picked: FileEntry[]) {
    setFailures([]);
    setPicking({ mode, items: picked.map((entry) => ({ entry, path: join(path, entry.name) })) });
  }

  function finished(result: PickerResult) {
    setPicking(null);
    setFailures(result.failures);
    // What could not go stays checked, to try again
    setSelected(new Set(result.failures.map((failure) => failure.name)));
    if (result.copies > 0) setCopiesStarted((count) => count + 1);
    if (result.moved > 0) reload();
  }

  async function removeChosen() {
    const failed: Failure[] = [];
    for (const entry of chosen) {
      try {
        await callFiles("/delete", { path: join(path, entry.name) }, "POST");
      } catch (err) {
        failed.push({ name: entry.name, reason: message(err) });
      }
    }
    setFailures(failed);
    setSelected(new Set(failed.map((failure) => failure.name)));
    reload();
  }

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

        <Transfers started={copiesStarted} onFinished={reload} />

        {error && <Callout tone="red">{error}</Callout>}
        {failures.length > 0 && (
          <Callout tone="red">
            <span className="whitespace-pre-line">
              {failures.length === 1 ? "1 item" : `${failures.length} items`} could not be done:{"\n"}
              {failures.map((failure) => `${failure.name}: ${failure.reason}`).join("\n")}
            </span>
          </Callout>
        )}
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
          <SelectionBar
            folder={path}
            visible={entries}
            chosen={chosen}
            selected={selected}
            onToggleAll={toggleAll}
            onClear={() => setSelected(new Set())}
            onPick={(mode) => pick(mode, chosen)}
            onDelete={removeChosen}
          />
        )}
        {entries.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {entries.map((entry) => (
              <EntryRow
                key={entry.name}
                folder={path}
                entry={entry}
                checked={selected.has(entry.name)}
                onToggle={() => toggle(entry.name)}
                onOpen={open}
                onChanged={reload}
                onPick={(mode) => pick(mode, [entry])}
              />
            ))}
          </ul>
        )}
      </div>
      <FolderPicker request={picking} onClose={() => setPicking(null)} onDone={finished} />
    </Panel>
  );
}

/** Checks all the folder's items, or none, and acts on the ones checked from its "⋯" menu. */
function SelectionBar({
  folder,
  visible,
  chosen,
  selected,
  onToggleAll,
  onClear,
  onPick,
  onDelete,
}: {
  folder: string;
  /** The items on screen, which "all" checks. */
  visible: FileEntry[];
  chosen: FileEntry[];
  selected: Set<string>;
  onToggleAll: () => void;
  onClear: () => void;
  onPick: (mode: PickerRequest["mode"]) => void;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const all = visible.every((entry) => selected.has(entry.name));
  const some = !all && visible.some((entry) => selected.has(entry.name));
  const appFolder = chosen.some((entry) => entry.protected);
  const bytes = chosen.reduce((total, entry) => total + (entry.size ?? 0), 0);
  const folders = chosen.filter((entry) => entry.kind === "folder").length;
  const count = chosen.length === 1 ? "1 item" : `${chosen.length} items`;

  // Nothing checked is nothing to confirm
  if (confirming && chosen.length === 0) setConfirming(false);

  async function remove() {
    setBusy(true);
    await onDelete();
    setBusy(false);
    setConfirming(false);
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4">
      <Checkbox
        checked={all}
        indeterminate={some}
        onChange={onToggleAll}
        label={all ? "Uncheck everything" : "Check everything"}
      />
      {chosen.length === 0 ? (
        <span className="text-xs text-muted">Select all</span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-xs text-muted tabular-nums">
          <span className="font-medium text-foreground">{count} selected</span>
          {bytes > 0 && ` · ${formatBytes(bytes)}`}
          {folders > 0 && ` · ${folders === 1 ? "1 folder" : `${folders} folders`}`}
        </span>
      )}
      {chosen.length > 0 && (
        <div className="ml-auto flex items-center gap-1.5">
          {confirming ? (
            <>
              <span className="text-xs text-muted">Delete {count}? It cannot be undone.</span>
              <button type="button" onClick={remove} disabled={busy} className={`${BUTTON} ${BUTTON_TONES.red}`}>
                {busy && <Spinner className="h-3 w-3" />}
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className={`${BUTTON} ${BUTTON_TONES.neutral}`}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClear} className={`${BUTTON} ${BUTTON_TONES.neutral}`}>
                Clear
              </button>
              <ActionsMenu
                label={`Actions for the ${count} selected`}
                actions={[
                  {
                    label: chosen.length === 1 && chosen[0].kind === "file" ? "Download" : "Download as zip",
                    href: downloadHref(chosen.map((entry) => join(folder, entry.name))),
                  },
                  { label: "Copy to…", onSelect: () => onPick("copy") },
                  {
                    label: "Move to…",
                    onSelect: () => onPick("move"),
                    disabled: appFolder,
                    hint: "An app's folder is selected; it cannot be moved",
                  },
                  {
                    label: "Delete",
                    tone: "red",
                    onSelect: () => setConfirming(true),
                    disabled: appFolder,
                    hint: "An app's folder is selected; it cannot be deleted",
                  },
                ]}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={input}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      title={label}
      className="h-4 w-4 shrink-0 cursor-pointer accent-violet-500"
    />
  );
}

function EntryRow({
  folder,
  entry,
  checked,
  onToggle,
  onOpen,
  onChanged,
  onPick,
}: {
  folder: string;
  entry: FileEntry;
  checked: boolean;
  onToggle: () => void;
  onOpen: (path: string) => void;
  onChanged: () => void;
  /** Opens the folder picker to move or copy it somewhere else on the disk. */
  onPick: (mode: PickerRequest["mode"]) => void;
}) {
  const path = join(folder, entry.name);
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
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
  const appFolder = "It is used by an app on the server";

  return (
    <li
      className={`glass flex flex-col gap-2 rounded-2xl px-3 py-2.5 transition sm:px-4 ${busy ? "opacity-60" : ""} ${
        checked ? "ring-1 ring-violet-500/50 ring-inset" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Checkbox checked={checked} onChange={onToggle} label={`Select ${entry.name}`} />
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
        {!renaming && confirming && (
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={remove} disabled={busy} className={`${BUTTON} ${BUTTON_TONES.red}`}>
              {busy && <Spinner className="h-3 w-3" />}
              {isFolder ? "Delete all inside" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className={`${BUTTON} ${BUTTON_TONES.neutral}`}
            >
              Cancel
            </button>
          </div>
        )}
        {!renaming && !confirming && (
          <div className="ml-auto">
            <ActionsMenu
              label={`Actions for ${entry.name}`}
              disabled={busy}
              actions={[
                { label: isFolder ? "Download as zip" : "Download", href: downloadHref([path]) },
                { label: "Copy to…", onSelect: () => onPick("copy") },
                { label: "Move to…", onSelect: () => onPick("move"), disabled: entry.protected, hint: appFolder },
                { label: "Rename", onSelect: () => setRenaming(true), disabled: entry.protected, hint: appFolder },
                {
                  label: "Delete",
                  tone: "red",
                  onSelect: () => setConfirming(true),
                  disabled: entry.protected,
                  hint: appFolder,
                },
              ]}
            />
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
