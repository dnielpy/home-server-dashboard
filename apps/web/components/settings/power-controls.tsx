"use client";

import { useEffect, useRef, useState } from "react";

import { PowerIcon } from "@/components/icons/power-icon";
import { RefreshIcon } from "@/components/icons/refresh-icon";
import { AgentRequestError, callAgent } from "@/components/management/agent-client";
import { Callout, Spinner } from "@/components/management/parts";

type Power = "reboot" | "poweroff";

// How often it asks whether the server is back while it reboots
const BACK_POLL_MS = 5_000;

const COPY = {
  reboot: {
    button: "Restart",
    title: "Restart the server?",
    text: "Every app on it goes down while it reboots: Bluetti, Home Net, LocalTube and this dashboard. It usually takes a minute or two to come back.",
    confirm: "Restart server",
    sent: "Restarting the server…",
    sentText: "This dashboard goes away too. It says so here as soon as the server answers again.",
  },
  poweroff: {
    button: "Power off",
    title: "Power off the server?",
    text: "Every app on it stops: Bluetti, Home Net, LocalTube and this dashboard. It cannot be turned on again from here: someone has to press its power button.",
    confirm: "Power off server",
    sent: "Powering off the server…",
    sentText: "It stays off until someone presses its power button.",
  },
};

type Phase = "confirm" | "sending" | "sent" | "back";

/** The page's restart and power off buttons for the whole server, each asking first in a modal. */
export function PowerControls() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<Power>("reboot");
  const [phase, setPhase] = useState<Phase>("confirm");
  const [error, setError] = useState<string | null>(null);

  function open(next: Power) {
    setAction(next);
    setPhase("confirm");
    setError(null);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  async function confirm() {
    setPhase("sending");
    setError(null);
    try {
      await callAgent(`power/${action}`, "POST");
      setPhase("sent");
    } catch (err) {
      setError(err instanceof AgentRequestError ? err.message : "Could not reach the server");
      setPhase("confirm");
    }
  }

  // While it reboots: first it stops answering, then it answers again
  useEffect(() => {
    if (phase !== "sent" || action !== "reboot") return;
    let wentDown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function poll() {
      try {
        const response = await fetch("/api/system", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        if (wentDown) {
          setPhase("back");
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
        wentDown = true;
      }
      timer = setTimeout(poll, BACK_POLL_MS);
    }

    timer = setTimeout(poll, BACK_POLL_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [phase, action]);

  const copy = COPY[action];
  const danger = action === "poweroff";

  return (
    <>
      <button
        type="button"
        onClick={() => open("reboot")}
        className="glass inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-surface-hover"
      >
        <RefreshIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Restart</span>
      </button>
      <button
        type="button"
        onClick={() => open("poweroff")}
        className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-3.5 py-2 text-sm font-medium text-red-600 ring-1 ring-red-500/30 transition ring-inset hover:bg-red-500/15 dark:text-red-400"
      >
        <PowerIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Power off</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="power-title"
        // Escape does nothing while the request is on its way
        onCancel={(event) => phase === "sending" && event.preventDefault()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-surface-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start gap-4">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                danger ? "bg-red-500/12 text-red-600 dark:text-red-400" : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
              }`}
            >
              {danger ? <PowerIcon className="h-6 w-6" /> : <RefreshIcon className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <h2 id="power-title" className="text-lg font-semibold tracking-tight">
                {phase === "sent" ? copy.sent : phase === "back" ? "The server is back" : copy.title}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {phase === "sent"
                  ? copy.sentText
                  : phase === "back"
                    ? "It rebooted and is answering again."
                    : copy.text}
              </p>
            </div>
          </div>

          {error && <Callout tone="red">{error}</Callout>}

          {phase === "sent" && action === "reboot" && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="h-3.5 w-3.5 text-sky-500" />
              Waiting for the server…
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {phase === "confirm" || phase === "sending" ? (
              <>
                <button
                  type="button"
                  onClick={close}
                  disabled={phase === "sending"}
                  className="glass rounded-xl px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={phase === "sending"}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60 ${
                    danger ? "bg-red-600" : "bg-amber-600"
                  }`}
                >
                  {phase === "sending" && <Spinner className="h-3.5 w-3.5" />}
                  {copy.confirm}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={close}
                className="glass rounded-xl px-4 py-2 text-sm font-medium hover:bg-surface-hover"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
