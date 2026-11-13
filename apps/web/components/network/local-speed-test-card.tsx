"use client";

import { useEffect, useState } from "react";

import { RefreshIcon } from "@/components/icons/refresh-icon";
import { formatSpeed, InfoItem } from "@/components/network/speed-test-card";
import { measureDownload, measureLatency, measureUpload } from "@/lib/network/local-speed-test";

type Phase = "latency" | "download" | "upload" | "done" | "error";

type TestState = {
  phase: Phase;
  latencyMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
};

const INITIAL: TestState = { phase: "latency", latencyMs: null, downloadMbps: null, uploadMbps: null };

const STATUS: Record<Phase, string> = {
  latency: "Measuring latency…",
  download: "Measuring download…",
  upload: "Measuring upload…",
  done: "Just measured",
  error: " ",
};

function SmallStat({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="text-center">
      <div className="text-xs tracking-wide text-muted uppercase">{label}</div>
      <div
        className={`mt-1 text-3xl font-light tabular-nums transition-colors duration-500 ${
          active ? "text-muted" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * The fast.com style test, but against this server instead of the internet: it shows the speed of the link between
 * the device that opened the page and the dashboard (wifi, cables, the router), measuring latency, download and upload.
 */
export function LocalSpeedTestCard() {
  const [run, setRun] = useState(0);
  const [state, setState] = useState<TestState>(INITIAL);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const update = (patch: Partial<TestState>) => setState((current) => ({ ...current, ...patch }));

    async function measure() {
      const latencyMs = await measureLatency(signal);
      update({ latencyMs, phase: "download" });
      const downloadMbps = await measureDownload(signal, (mbps) => update({ downloadMbps: mbps }));
      update({ downloadMbps, phase: "upload" });
      const uploadMbps = await measureUpload(signal, (mbps) => update({ uploadMbps: mbps }));
      update({ uploadMbps, phase: "done" });
    }

    measure().catch(() => {
      if (!signal.aborted) update({ phase: "error" });
    });
    return () => controller.abort();
  }, [run]);

  function runAgain() {
    setState(INITIAL);
    setRun((current) => current + 1);
  }

  const { phase, latencyMs, downloadMbps, uploadMbps } = state;
  const measuring = phase === "latency" || phase === "download" || phase === "upload";

  return (
    <section aria-labelledby="local-speed-test-title" className="glass glass-glow accent-sky w-full rounded-3xl px-5 py-12 text-center xl:py-16">
      <h2 id="local-speed-test-title" className="text-xl text-muted sm:text-2xl">
        {phase === "error" ? "Could not measure the speed to this server" : "Your speed to this server is"}
      </h2>

      <div className="mt-2 flex items-center justify-center gap-4 sm:gap-6">
        <p
          aria-live="polite"
          aria-label={
            downloadMbps !== null
              ? `${formatSpeed(downloadMbps)} megabits per second download${phase === "download" ? ", measuring" : ""}`
              : "Measuring"
          }
          className="flex items-baseline gap-2"
        >
          <span
            className={`text-8xl font-extralight tabular-nums transition-colors duration-500 sm:text-9xl lg:text-[12rem] lg:leading-none ${
              phase === "latency" || phase === "download" ? "text-muted" : "text-foreground"
            }`}
          >
            {downloadMbps !== null ? formatSpeed(downloadMbps) : "0"}
          </span>
          <span className="text-2xl font-light text-muted sm:text-3xl lg:text-4xl">Mbps</span>
        </p>

        <button
          type="button"
          onClick={runAgain}
          disabled={measuring}
          aria-label={measuring ? "Measuring" : "Run the local speed test again"}
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

      <p className="mt-3 text-sm text-muted tabular-nums">{STATUS[phase]}</p>

      <div className="mx-auto mt-6 flex max-w-xs justify-center gap-10">
        <SmallStat
          label="Latency"
          value={latencyMs !== null ? `${Math.round(latencyMs)} ms` : "—"}
          active={phase === "latency"}
        />
        <SmallStat
          label="Upload"
          value={uploadMbps !== null ? `${formatSpeed(uploadMbps)} Mbps` : "—"}
          active={phase === "upload"}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowInfo((current) => !current)}
        aria-expanded={showInfo}
        className="mt-6 text-sm text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        {showInfo ? "Hide info" : "Show more info"}
      </button>

      {showInfo && (
        <dl className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-4 text-left sm:grid-cols-3">
          <InfoItem label="Server" value={typeof window !== "undefined" ? window.location.host : "—"} />
          <InfoItem label="Streams" value="4 parallel" />
          <InfoItem label="Each phase" value="8 s" />
          <InfoItem label="Source" value="This dashboard" />
        </dl>
      )}
    </section>
  );
}
