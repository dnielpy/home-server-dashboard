"use client";

import { useEffect, useRef, useState } from "react";

import { FolderIcon } from "@/components/icons/folder-icon";
import { Callout, Spinner } from "@/components/management/parts";
import type { FileEntry, Folder } from "@/lib/api";

import { BUTTON, BUTTON_TONES, callFiles, INPUT, join, message } from "./files-client";

export type PickerItem = {
  entry: FileEntry;
  /** Relative to the disk. */
  path: string;
};

export type PickerRequest = {
  mode: "move" | "copy";
  /** What is moved or copied, all from one folder. */
  items: PickerItem[];
};

/** How a move or copy of several went: the copies started, and what could not go, with why. */
export type PickerResult = {
  moved: number;
  copies: number;
  failures: { name: string; reason: string }[];
};

function parentOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function isPicked(request: PickerRequest, path: string): boolean {
  return request.items.some((item) => item.entry.kind === "folder" && item.path === path);
}

/** Why the copy or move cannot go into `folder`, or null when it can. */
function refusal(request: PickerRequest, folder: string): string | null {
  const inside = request.items.some(
    (item) => item.entry.kind === "folder" && (folder === item.path || folder.startsWith(`${item.path}/`)),
  );
  if (inside) return "A folder cannot go inside itself";
  if (request.mode === "move" && folder === parentOf(request.items[0].path)) {
    return request.items.length === 1 ? "It is already in this folder" : "They are already in this folder";
  }
  return null;
}

/**
 * A modal to browse the disk's folders and pick where files and folders are moved or copied to. A move ends here; a
 * copy only starts, and runs in the background. When nothing could go, it stays open with why; otherwise `onDone`
 * says how it went.
 */
export function FolderPicker({
  request,
  onClose,
  onDone,
}: {
  request: PickerRequest | null;
  onClose: () => void;
  onDone: (result: PickerResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [browsing, setBrowsing] = useState("");
  const [folder, setFolder] = useState<Folder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  // Each request starts browsing in the folder the entry is in
  const [opened, setOpened] = useState<PickerRequest | null>(null);
  if (opened !== request) {
    setOpened(request);
    if (request) {
      setBrowsing(parentOf(request.items[0].path));
      setFolder(null);
      setError(null);
      setBusy(false);
      setCreating(false);
    }
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (request && !element.open) element.showModal();
    if (!request && element.open) element.close();
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const signal = { aborted: false };
    async function read() {
      try {
        const next = await callFiles<Folder>("", { path: browsing });
        if (!signal.aborted) {
          setFolder(next);
          setError(null);
        }
      } catch (err) {
        if (!signal.aborted) setError(message(err));
      }
    }
    read();
    return () => {
      signal.aborted = true;
    };
  }, [request, browsing]);

  if (!request) return <dialog ref={dialog} onClose={onClose} className="hidden" />;

  const shown = folder && folder.path === browsing ? folder : null;
  const folders = shown?.entries.filter((entry) => entry.kind === "folder") ?? [];
  const parts = browsing ? browsing.split("/") : [];
  const blocked = refusal(request, browsing);
  const verb = request.mode === "move" ? "Move" : "Copy";
  const what = request.items.length === 1 ? `“${request.items[0].entry.name}”` : `${request.items.length} items`;

  async function confirm() {
    if (!request || blocked) return;
    setBusy(true);
    setError(null);
    const result: PickerResult = { moved: 0, copies: 0, failures: [] };
    // One at a time, so a full disk or a name taken stops only that one
    for (const item of request.items) {
      try {
        await callFiles(`/${request.mode}`, { path: item.path, to: browsing }, "POST");
        if (request.mode === "move") result.moved += 1;
        else result.copies += 1;
      } catch (err) {
        result.failures.push({ name: item.entry.name, reason: message(err) });
      }
    }
    if (result.moved + result.copies > 0) {
      onDone(result);
      return;
    }
    setError(
      result.failures.length === 1
        ? result.failures[0].reason
        : result.failures.map((failure) => `${failure.name}: ${failure.reason}`).join("\n"),
    );
    setBusy(false);
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await callFiles<{ path: string }>("/mkdir", { path: browsing, name }, "POST");
      setCreating(false);
      setNewName("");
      setBrowsing(created.path);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="picker-title"
      onClose={onClose}
      onCancel={(event) => busy && event.preventDefault()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-surface-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[80vh] flex-col gap-4 p-6">
        <div>
          <h2 id="picker-title" className="font-semibold tracking-tight">
            {verb} {what}
          </h2>
          <p className="text-sm text-muted">Open the folder it goes into, then press {verb} here.</p>
        </div>

        <nav aria-label="Destination folder" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setBrowsing("")}
            className="rounded-md px-1.5 py-0.5 text-muted transition hover:bg-surface-hover hover:text-foreground"
          >
            Disk
          </button>
          {parts.map((part, index) => (
            <span key={index} className="flex min-w-0 items-center gap-1">
              <span aria-hidden className="text-muted/60">
                /
              </span>
              <button
                type="button"
                onClick={() => setBrowsing(parts.slice(0, index + 1).join("/"))}
                className={`truncate rounded-md px-1.5 py-0.5 transition hover:bg-surface-hover ${
                  index === parts.length - 1 ? "font-medium text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {part}
              </button>
            </span>
          ))}
        </nav>

        <div className="min-h-40 flex-1 overflow-y-auto rounded-2xl ring-1 ring-surface-border ring-inset">
          {!shown && !error && (
            <p className="flex items-center gap-2 p-4 text-sm text-muted">
              <Spinner className="h-3.5 w-3.5 text-violet-500" /> Loading…
            </p>
          )}
          {shown && folders.length === 0 && !creating && (
            <p className="p-4 text-sm text-muted">No folders inside. It can go right here.</p>
          )}
          <ul className="flex flex-col p-1.5">
            {creating && (
              <li className="flex items-center gap-2 px-2 py-1.5">
                <FolderIcon className="h-4 w-4 shrink-0 text-violet-500" />
                <form
                  className="flex flex-1 items-center gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createFolder();
                  }}
                >
                  <input
                    autoFocus
                    value={newName}
                    onChange={(event) => setNewName(event.currentTarget.value)}
                    onKeyDown={(event) => event.key === "Escape" && (event.preventDefault(), setCreating(false))}
                    disabled={busy}
                    placeholder="New folder"
                    aria-label="New folder name"
                    maxLength={255}
                    className={INPUT}
                  />
                  <button type="submit" disabled={busy} className={`${BUTTON} ${BUTTON_TONES.violet}`}>
                    Create
                  </button>
                </form>
              </li>
            )}
            {folders.map((entry) => {
              const path = join(browsing, entry.name);
              const itself = isPicked(request, path);
              return (
                <li key={entry.name}>
                  <button
                    type="button"
                    disabled={itself}
                    onClick={() => setBrowsing(path)}
                    title={itself ? "This is what you are moving" : entry.name}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition hover:bg-surface-hover disabled:opacity-40"
                  >
                    <FolderIcon className="h-4 w-4 shrink-0 text-violet-500" />
                    <span className="truncate">{entry.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {error && (
          <Callout tone="red">
            <span className="whitespace-pre-line">{error}</span>
          </Callout>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={!shown || busy || creating}
            className={`${BUTTON} ${BUTTON_TONES.neutral}`}
          >
            + New folder
          </button>
          <div className="flex items-center gap-2">
            {blocked && <span className="text-xs text-muted">{blocked}</span>}
            <button type="button" onClick={onClose} disabled={busy} className={`${BUTTON} ${BUTTON_TONES.neutral}`}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!shown || busy || blocked !== null}
              className={`${BUTTON} ${BUTTON_TONES.violet}`}
            >
              {busy && <Spinner className="h-3 w-3" />}
              {verb} here
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
