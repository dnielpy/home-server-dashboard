"use client";

import { type FormEvent, useRef, useState } from "react";

import { callDownloads, DownloadsRequestError } from "@/components/downloads/downloads-client";
import { useDownloadsRefresh } from "@/components/downloads/downloads-refresh";
import { DownloadIcon } from "@/components/icons/download-icon";
import { Callout, Spinner } from "@/components/management/parts";

function message(error: unknown): string {
  return error instanceof DownloadsRequestError ? error.message : "Something went wrong";
}

function links(text: string): string[] {
  return text
    .split(/\s+/)
    .map((link) => link.trim())
    .filter(Boolean);
}

/** The page's Add download button and its modal: one or more links for the server to download by itself. */
export function AddDownload() {
  const { notifyAdded } = useDownloadsRefresh();
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urls = links(text);

  function close() {
    dialog.current?.close();
    setText("");
    setName("");
    setError(null);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!urls.length || adding) return;
    setAdding(true);
    setError(null);
    // One after the other, so a wrong link says which one it was and the ones before it stay added
    const left = [...urls];
    try {
      while (left.length) {
        await callDownloads("", "POST", { url: left[0], name: urls.length === 1 && name.trim() ? name.trim() : null });
        left.shift();
      }
      close();
    } catch (err) {
      setText(left.join("\n"));
      setError(`${left[0]}: ${message(err)}`);
    } finally {
      setAdding(false);
      notifyAdded();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
      >
        <span aria-hidden className="text-base leading-none">
          +
        </span>
        <span className="hidden sm:inline">Add download</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="add-download-title"
        onClose={() => setError(null)}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-surface-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={add} className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
              <DownloadIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="add-download-title" className="text-lg font-semibold tracking-tight">
                Add download
              </h2>
              <p className="mt-1 text-sm text-muted">
                The server downloads it by itself and resumes after every cut, so this device can go off
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="shrink-0 rounded-lg px-2 py-0.5 text-lg text-muted transition hover:bg-surface-hover hover:text-foreground"
            >
              ×
            </button>
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            {urls.length > 1 ? `${urls.length} links` : "Link"}
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              autoFocus
              spellCheck={false}
              placeholder="https://example.com/file.zip — one per line for several"
              className="glass resize-y rounded-xl px-3 py-2 font-mono text-sm break-all text-foreground outline-none focus:ring-2 focus:ring-sky-500/50"
            />
          </label>
          {urls.length <= 1 && (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Name (optional)
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                placeholder="The one the server gives it"
                className="glass rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-sky-500/50"
              />
            </label>
          )}
          {error && <Callout tone="red">{error}</Callout>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={adding}
              className="glass rounded-xl px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!urls.length || adding}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {adding && <Spinner className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
