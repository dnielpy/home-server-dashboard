"use client";

import { useEffect, useRef, useState } from "react";

export class AgentRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Calls the agent on the server through the web app's /api/management. Throws AgentRequestError, with status 0
 * when the web app itself could not be reached. */
export async function callAgent<T>(path: string, method: "GET" | "POST" = "GET", signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/management/${path}`, { method, cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AgentRequestError(0, "Could not reach the dashboard");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AgentRequestError(response.status, body?.detail ?? `The dashboard answered ${response.status}`);
  }
  return body as T;
}

export function projectPath(name: string, rest = ""): string {
  return `projects/${encodeURIComponent(name)}${rest}`;
}

/** The time in seconds, ticking every second; null before mount so the server's clock never shows. */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now() / 1000);
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export type Key = "up" | "down" | "left" | "right" | "enter" | "back" | "r" | "l";

const KEYS: Record<string, Key> = {
  ArrowUp: "up",
  k: "up",
  ArrowDown: "down",
  j: "down",
  ArrowLeft: "left",
  h: "left",
  ArrowRight: "right",
  l: "l",
  Enter: "enter",
  Escape: "back",
  q: "back",
  r: "r",
};

/** The terminal panel's keys. `l` is both "right" and "full log", so the screen that gets it decides. Enter on a
 * focused button is left to the button. */
export function useKeys(onKey: (key: Key) => void): void {
  const handler = useRef(onKey);
  useEffect(() => {
    handler.current = onKey;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const key = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!key) return;
      if (key === "enter" && target?.closest("button, a")) return;
      event.preventDefault();
      handler.current(key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
