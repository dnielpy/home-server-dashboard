"use client";

import { type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";

import { DownloadIcon } from "@/components/icons/download-icon";
import { SendIcon } from "@/components/icons/send-icon";
import { Callout, Spinner } from "@/components/management/parts";
import { callSender, SenderRequestError, uploadFile } from "@/components/sender/sender-client";
import { useSenderRefresh } from "@/components/sender/sender-refresh";
import { Meter } from "@/components/ui/meter";
import { formatBytes } from "@/lib/format";

type Item = {
  key: string;
  file: File;
  state: "queued" | "uploading" | "done" | "error";
  loaded: number;
  /** Its id on the server once uploaded. */
  id?: string;
  error?: string;
};

let nextKey = 0;

function message(error: unknown): string {
  return error instanceof SenderRequestError ? error.message : "Something went wrong";
}

/** The page's New package button and its modal: drop files, they go up to the server one after the other, then a
 * name and a PIN send them as a package. Closing the modal keeps the uploads going; it shows them again on opening. */
export function NewPackage() {
  const { notifySent } = useSenderRefresh();
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // The package the files go to, made with the first file
  const draft = useRef<Promise<string> | null>(null);
  const uploads = useRef(new Map<string, AbortController>());

  function update(key: string, change: Partial<Item>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }

  function draftId(): Promise<string> {
    draft.current ??= callSender<{ id: string }>("packages", "POST").then(
      (created) => created.id,
      (err) => {
        draft.current = null;
        throw err;
      },
    );
    return draft.current;
  }

  // One file at a time, so each gets the whole connection and the first ones are ready soon
  const queue = useRef<Item[]>([]);
  const active = useRef<string | null>(null);

  function pump() {
    if (active.current !== null) return;
    const item = queue.current.shift();
    if (!item) return;
    const controller = new AbortController();
    active.current = item.key;
    uploads.current.set(item.key, controller);
    update(item.key, { state: "uploading", loaded: 0, error: undefined });
    draftId()
      .then((id) => uploadFile(id, item.file, (loaded) => update(item.key, { loaded }), controller.signal))
      .then((stored) => update(item.key, { state: "done", id: stored.id, loaded: item.file.size }))
      .catch((err) => {
        if (!controller.signal.aborted) update(item.key, { state: "error", error: message(err) });
      })
      .finally(() => {
        uploads.current.delete(item.key);
        active.current = null;
        pump();
      });
  }

  function enqueue(added: Item[]) {
    queue.current.push(...added);
    pump();
  }

  // Leaving the page would cut the uploads
  const busy = items.some((item) => item.state === "uploading" || item.state === "queued");
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const added = Array.from(files, (file): Item => ({ key: String(nextKey++), file, state: "queued", loaded: 0 }));
    setItems((current) => [...current, ...added]);
    enqueue(added);
  }

  async function remove(item: Item) {
    queue.current = queue.current.filter((other) => other.key !== item.key);
    uploads.current.get(item.key)?.abort();
    setItems((current) => current.filter((other) => other.key !== item.key));
    if (item.state === "done" && item.id && draft.current) {
      const id = await draft.current;
      callSender(`packages/${id}/files/${item.id}`, "DELETE").catch(() => {});
    }
  }

  async function reset(discard: boolean) {
    queue.current = [];
    for (const controller of uploads.current.values()) controller.abort();
    const pending = draft.current;
    draft.current = null;
    setItems([]);
    setName("");
    setPin("");
    setError(null);
    if (discard && pending) {
      pending.then((id) => callSender(`packages/${id}`, "DELETE")).catch(() => {});
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.current) return;
    setSending(true);
    setError(null);
    try {
      const id = await draft.current;
      await callSender(`packages/${id}/seal`, "POST", { name: name.trim(), pin });
      await reset(false);
      dialog.current?.close();
      notifySent();
    } catch (err) {
      setError(message(err));
    } finally {
      setSending(false);
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  }

  const total = items.reduce((sum, item) => sum + item.file.size, 0);
  const ready = items.length > 0 && items.every((item) => item.state === "done");
  const canSend = ready && name.trim().length > 0 && /^\d{4}$/.test(pin) && !sending;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
      >
        {busy ? <Spinner className="h-4 w-4" /> : <span aria-hidden className="text-base leading-none">+</span>}
        <span className="hidden sm:inline">{busy ? "Uploading…" : "New package"}</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="new-package-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-surface-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
              <SendIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="new-package-title" className="text-lg font-semibold tracking-tight">
                New package
              </h2>
              <p className="mt-1 text-sm text-muted tabular-nums">
                {items.length
                  ? `${items.length} ${items.length === 1 ? "file" : "files"} · ${formatBytes(total)}`
                  : "Files for another device on the network"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="shrink-0 rounded-lg px-2 py-0.5 text-lg text-muted transition hover:bg-surface-hover hover:text-foreground"
            >
              ×
            </button>
          </div>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${
              dragging ? "border-sky-500 bg-sky-500/10" : "border-surface-border"
            }`}
          >
            <span className="bg-accent-soft text-accent flex h-12 w-12 items-center justify-center rounded-2xl">
              <DownloadIcon className="h-6 w-6 rotate-180" />
            </span>
            <p className="text-sm text-muted">
              <span className="hidden sm:inline">Drop files here or </span>
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
              >
                choose them
              </button>
            </p>
            <input
              ref={input}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                add(event.target.files);
                event.target.value = "";
              }}
            />
          </div>


          {items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.key} className="glass flex flex-col gap-2 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={item.file.name}>
                      {item.file.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {item.state === "uploading"
                        ? `${formatBytes(item.loaded)} / ${formatBytes(item.file.size)}`
                        : formatBytes(item.file.size)}
                    </span>
                    {item.state === "uploading" && <Spinner className="h-3.5 w-3.5 text-sky-500" />}
                    {item.state === "done" && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓</span>}
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      aria-label={`Remove ${item.file.name}`}
                      className="shrink-0 rounded-lg px-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground"
                    >
                      ×
                    </button>
                  </div>
                  {item.state === "uploading" && (
                    <Meter percent={item.file.size ? (item.loaded / item.file.size) * 100 : 100} active />
                  )}
                  {item.state === "error" && (
                    <p className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                      {item.error}
                      <button
                        type="button"
                        onClick={() => {
                          update(item.key, { state: "queued", error: undefined });
                          enqueue([item]);
                        }}
                        className="font-medium underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <form onSubmit={send} className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-muted">
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    placeholder="Holiday photos"
                    className="glass rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-medium text-muted sm:w-32">
                  PIN
                  <input
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="4 digits"
                    className="glass rounded-xl px-3 py-2 text-sm tracking-[0.4em] text-foreground tabular-nums outline-none placeholder:tracking-normal focus:ring-2 focus:ring-sky-500/50"
                  />
                </label>
              </div>
              {error && <Callout tone="red">{error}</Callout>}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {!ready && <span className="mr-auto text-xs text-muted">Waiting for the uploads to finish…</span>}
                <button
                  type="button"
                  onClick={() => {
                    reset(true);
                    dialog.current?.close();
                  }}
                  disabled={sending}
                  className="glass rounded-xl px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  {sending && <Spinner className="h-3.5 w-3.5" />}
                  Send
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
