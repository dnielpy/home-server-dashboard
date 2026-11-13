"use client";

import { useEffect, useState } from "react";

import { RefreshIcon } from "@/components/icons/refresh-icon";
import type { SpeedTestEvent } from "@/lib/homenet-api";
import { readNdjson } from "@/lib/network/ndjson";

type Result = Omit<Extract<SpeedTestEvent, { type: "result" }>, "type">;

type TestState = { kind: "measuring"; mbps: number | null } | { kind: "done"; result: Result } | { kind: "error" };

export function formatSpeed(mbps: number): string {
  return mbps >= 100 ? mbps.toFixed(0) : mbps.toFixed(1);
}

export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

/** A full screen download speed test laid out like fast.com: it measures as soon as it mounts, with one big number that climbs. */
export function SpeedTestCard() {
  const [run, setRun] = useState(0);
  const [state, setState] = useState<TestState>({ kind: "measuring", mbps: null });
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function measure() {
      const response = await fetch("/api/network/speed-test", { method: "POST", signal: controller.signal, cache: "no-store" });
      if (!response.ok || !response.body) throw new Error(`Speed test responded with ${response.status}`);

      let finished = false;
      await readNdjson<SpeedTestEvent>(response, (event) => {
        if (event.type === "progress") setState({ kind: "measuring", mbps: event.mbps });
        else if (event.type === "result") {
          finished = true;
          setState({ kind: "done", result: event });
        } else {
          finished = true;
          setState({ kind: "error" });
        }
      });
      if (!finished) throw new Error("The speed test ended without a result");
    }

    measure().catch(() => {
      if (!controller.signal.aborted) setState({ kind: "error" });
    });
    return () => controller.abort();
  }, [run]);

  function runAgain() {
    setState({ kind: "measuring", mbps: null });
    setRun((current) => current + 1);
  }

  const measuring = state.kind === "measuring";
  const mbps = state.kind === "done" ? state.result.download_mbps : state.kind === "measuring" ? state.mbps : null;
  const result = state.kind === "done" ? state.result : null;

  return (
    <section
      aria-labelledby="speed-test-title"
      className="glass glass-glow accent-sky w-full rounded-3xl px-5 py-12 text-center xl:py-16"
    >
      <h2 id="speed-test-title" className="text-xl text-muted sm:text-2xl">
        {state.kind === "error" ? "Could not measure your internet speed" : "Your internet speed is"}
      </h2>

      <div className="mt-2 flex items-center justify-center gap-4 sm:gap-6">
        <p
          aria-live="polite"
          aria-label={mbps !== null ? `${formatSpeed(mbps)} megabits per second${measuring ? ", measuring" : ""}` : "Measuring"}
          className="flex items-baseline gap-2"
        >
          <span
            className={`text-8xl font-extralight tabular-nums transition-colors duration-500 sm:text-9xl lg:text-[12rem] lg:leading-none ${
              measuring ? "text-muted" : "text-foreground"
            }`}
          >
            {mbps !== null ? formatSpeed(mbps) : "0"}
          </span>
          <span className="text-2xl font-light text-muted sm:text-3xl lg:text-4xl">Mbps</span>
        </p>

        <button
          type="button"
          onClick={runAgain}
          disabled={measuring}
          aria-label={measuring ? "Measuring" : "Run the speed test again"}
          className="glass relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-muted transition-colors enabled:hover:text-sky-500 disabled:cursor-default sm:h-16 sm:w-16"
        >
          {measuring ? (
            <span
              aria-hidden
              className="absolute -inset-0.5 animate-spin rounded-full border-2 border-transparent border-t-sky-500"
            />
          ) : (
            <RefreshIcon className="h-6 w-6" />
          )}
        </button>
      </div>

      <p className="mt-3 text-sm text-muted tabular-nums">
        {measuring
          ? "Measuring with fast.com…"
          : result
            ? "Just measured"
            : "\u00a0"}
      </p>

      <button
        type="button"
        onClick={() => setShowInfo((current) => !current)}
        aria-expanded={showInfo}
        className="mt-4 text-sm text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        {showInfo ? "Hide info" : "Show more info"}
      </button>

      {showInfo && (
        <dl className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-4 text-left sm:grid-cols-3">
          <InfoItem label="Latency" value={result?.ping_ms != null ? `${Math.round(result.ping_ms)} ms` : "—"} />
          <InfoItem label="Server" value={result?.server_location ?? "—"} />
          <InfoItem label="Client" value={result?.client_location ?? "—"} />
          <InfoItem
            label="Measured in"
            value={result?.duration_ms != null ? `${Math.round(result.duration_ms / 1000)} s` : "—"}
          />
          <InfoItem label="Source" value="fast.com" />
        </dl>
      )}
    </section>
  );
}
