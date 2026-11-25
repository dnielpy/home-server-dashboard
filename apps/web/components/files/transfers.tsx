"use client";

import { useEffect, useRef, useState } from "react";

import { Callout } from "@/components/management/parts";
import { Meter } from "@/components/ui/meter";
import type { FileTransfer } from "@/lib/api";
import { formatBytes } from "@/lib/format";

import { BUTTON, BUTTON_TONES, callFiles, message } from "./files-client";

// How often the copies are read while one runs
const POLL_MS = 1_000;

const STATES: Record<FileTransfer["kind"], Record<FileTransfer["state"], string>> = {
  copy: { running: "Copying", done: "Copied", failed: "Failed", cancelled: "Cancelled" },
  zip: { running: "Compressing", done: "Compressed", failed: "Failed", cancelled: "Cancelled" },
};

/** What a job works on: the name copied, or what goes in a zip. */
function subject(transfer: FileTransfer): string {
  const name = transfer.source.split("/").at(-1) ?? "";
  return transfer.kind === "zip" && transfer.count > 1 ? `${transfer.count} items` : name;
}

/**
 * The copies and zips running in the background, with their progress, and how the recent ones ended. Reads them on mount and
 * whenever `started` changes, then every second while one runs; `onFinished` is called when one ends.
 */
export function Transfers({ started, onFinished }: { started: number; onFinished: () => void }) {
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const running = useRef<Set<string>>(new Set());
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    async function read() {
      try {
        const next = await callFiles<FileTransfer[]>("/transfers", {});
        if (stopped) return;
        setTransfers(next);
        setError(null);
        const now = new Set(next.filter((t) => t.state === "running").map((t) => t.id));
        if ([...running.current].some((id) => !now.has(id))) finished.current();
        running.current = now;
        if (now.size > 0) timer = setTimeout(read, POLL_MS);
      } catch (err) {
        if (!stopped) setError(message(err));
      }
    }
    read();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [started]);

  async function cancel(id: string) {
    try {
      await callFiles(`/transfers/${id}/cancel`, {}, "POST");
    } catch (err) {
      setError(message(err));
    }
  }

  const shown = transfers.filter((t) => t.state === "running" || !hidden.has(t.id));
  if (!shown.length && !error) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {error && <Callout tone="red">{error}</Callout>}
      {shown.map((transfer) => {
        const percent = transfer.total > 0 ? (transfer.done / transfer.total) * 100 : 100;
        const isRunning = transfer.state === "running";
        return (
          <div key={transfer.id} className="glass flex flex-col gap-2 rounded-2xl px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block truncate font-medium" title={transfer.source}>
                  {STATES[transfer.kind][transfer.state]} {subject(transfer)}
                </span>
                <span className="block truncate text-xs text-muted" title={transfer.target}>
                  {transfer.kind === "zip" ? "into" : "to"} /{transfer.target}
                </span>
              </span>
              <span className="text-xs text-muted tabular-nums">
                {isRunning && `${Math.min(100, Math.floor(percent))}% · `}
                {formatBytes(Math.min(transfer.done, transfer.total))} of {formatBytes(transfer.total)}
              </span>
              {isRunning ? (
                <button type="button" onClick={() => cancel(transfer.id)} className={`${BUTTON} ${BUTTON_TONES.red}`}>
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setHidden((current) => new Set([...current, transfer.id]))}
                  className={`${BUTTON} ${BUTTON_TONES.neutral}`}
                >
                  Hide
                </button>
              )}
            </div>
            <Meter
              percent={percent}
              active={isRunning}
              className="h-1"
              barClassName={
                transfer.state === "failed"
                  ? "bg-red-500"
                  : transfer.state === "cancelled"
                    ? "bg-muted/50"
                    : transfer.state === "done"
                      ? "bg-emerald-500"
                      : undefined
              }
            />
            {transfer.error && <p className="text-xs text-red-600 dark:text-red-400">{transfer.error}</p>}
          </div>
        );
      })}
    </div>
  );
}
