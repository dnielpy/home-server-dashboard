"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PetScene =
  | { type: "play"; code: string; duration?: number }
  | { type: "message"; text: string; duration?: number };

export type PetResult = { ok: true } | { ok: false; message: string };

type Pending = { resolve: (result: PetResult) => void; timer: ReturnType<typeof setTimeout> };

/**
 * The sandboxed player of public/pet: the code of an animation is written by Astro, so it runs in an iframe with an
 * opaque origin that cannot reach the dashboard or the network. play() resolves when the scene ends.
 */
export function usePetFrame({ kiosk = false }: { kiosk?: boolean } = {}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<number, Pending>());
  const sequence = useRef(0);
  const [ready, setReady] = useState(false);
  // Changing it reloads the iframe, for when an animation froze it
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const waiting = pending.current;
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data ?? {};
      if (data.type === "ready") setReady(true);
      const entry = waiting.get(data.id);
      if (!entry || (data.type !== "done" && data.type !== "error")) return;
      clearTimeout(entry.timer);
      waiting.delete(data.id);
      entry.resolve(data.type === "done" ? { ok: true } : { ok: false, message: String(data.message) });
    }
    window.addEventListener("message", onMessage);
    // The player may have loaded, and said it was ready, before this listened
    frameRef.current?.contentWindow?.postMessage({ type: "ping" }, "*");
    return () => {
      window.removeEventListener("message", onMessage);
      for (const entry of waiting.values()) clearTimeout(entry.timer);
      waiting.clear();
    };
  }, []);

  const play = useCallback((scene: PetScene): Promise<PetResult> => {
    const target = frameRef.current?.contentWindow;
    if (!target) return Promise.resolve({ ok: false, message: "The player is not loaded" });
    const id = ++sequence.current;
    const limit = (scene.duration ?? 20_000) + 6_000;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.current.delete(id);
        setReady(false);
        setGeneration((value) => value + 1);
        resolve({ ok: false, message: "The animation froze the player" });
      }, limit);
      pending.current.set(id, { resolve, timer });
      target.postMessage({ ...scene, id }, "*");
    });
  }, []);

  const frame = (
    <iframe
      key={generation}
      ref={frameRef}
      src={kiosk ? "/pet/player.html?kiosk" : "/pet/player.html"}
      sandbox="allow-scripts"
      title="Astro"
      onLoad={(event) => event.currentTarget.contentWindow?.postMessage({ type: "ping" }, "*")}
      className="block h-full w-full border-0"
    />
  );

  return { frame, ready, play };
}
