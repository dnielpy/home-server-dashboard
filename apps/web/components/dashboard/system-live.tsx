"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import type { System } from "@/lib/api";

const REFRESH_INTERVAL_MS = 1_000;

type SystemLive = { data: System | null; error: string | null };

const SystemContext = createContext<SystemLive>({ data: null, error: null });

function failure(status: number): string {
  // 502 is the agent not answering the API; anything else is the API itself
  return status === 502
    ? "The agent on the server is not answering."
    : "Could not reach the dashboard API. Make sure it is running.";
}

/** Reads the server's stats every second for the cards inside it, so they share one request. */
export function SystemLiveProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<SystemLive>({ data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // The next read is scheduled after this one ends, so a slow answer never stacks requests
    async function poll() {
      // Nobody is looking at a hidden tab; it catches up as soon as it is shown again
      if (!document.hidden) {
        try {
          const response = await fetch("/api/system", { signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error(failure(response.status));
          const data: System = await response.json();
          setLive({ data, error: null });
        } catch (error) {
          if (controller.signal.aborted) return;
          // The last reading stays on screen while it fails, with the error for the cards that have nothing
          // A failed fetch() throws a TypeError, with no status to tell which one failed
          const message = error instanceof TypeError || !(error instanceof Error) ? failure(0) : error.message;
          setLive((previous) => ({ data: previous.data, error: message }));
        }
      }
      timer = setTimeout(poll, REFRESH_INTERVAL_MS);
    }

    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return <SystemContext value={live}>{children}</SystemContext>;
}

export function useSystem(): SystemLive {
  return useContext(SystemContext);
}
