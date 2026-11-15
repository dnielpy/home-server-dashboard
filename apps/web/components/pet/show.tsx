"use client";

import { useEffect } from "react";

import { ANIMATION_MS, type PetAnimation, type PetMessage, petApi } from "@/components/pet/api";
import { usePetFrame } from "@/components/pet/frame";

// One of every this many scenes is Astro holding up one of the messages
const MESSAGE_EVERY = 5;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The /pet show: the animations in a shuffled order that repeats none until all have played, so a new one Astro
 * saved joins the next round, with a message every fifth scene.
 */
export function PetShow() {
  const { frame, ready, play } = usePetFrame({ kiosk: true });

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let animations: PetAnimation[] = [];
    let messages: PetMessage[] = [];
    let queue: PetAnimation[] = [];
    let messageQueue: PetMessage[] = [];
    let lastId: number | null = null;
    let turn = 0;

    async function refresh() {
      // When the API is down it keeps showing what it had
      const [fresh, freshMessages] = await Promise.allSettled([
        petApi<PetAnimation[]>("/animations?enabled=true"),
        petApi<PetMessage[]>("/messages?enabled=true"),
      ]);
      if (fresh.status === "fulfilled") animations = fresh.value;
      if (freshMessages.status === "fulfilled") messages = freshMessages.value;
    }

    async function run() {
      while (!stopped) {
        turn++;
        if (queue.length === 0) {
          await refresh();
          queue = shuffle(animations);
          // The last one of a round is not the first of the next
          if (queue.length > 1 && queue[queue.length - 1].id === lastId) queue.unshift(queue.pop()!);
        }
        if (stopped) return;
        if (turn % MESSAGE_EVERY === 0 && messages.length > 0) {
          if (messageQueue.length === 0) messageQueue = shuffle(messages);
          await play({ type: "message", text: messageQueue.pop()!.text });
          continue;
        }
        const animation = queue.pop();
        if (!animation) {
          await sleep(ANIMATION_MS);
          continue;
        }
        lastId = animation.id;
        const result = await play({ type: "play", code: animation.code, duration: ANIMATION_MS });
        if (!result.ok) {
          petApi(`/animations/${animation.id}/failures`, { method: "POST" }).catch(() => undefined);
          // The player shows Astro idle for a moment instead of jumping straight to the next one
          await sleep(1500);
        }
      }
    }

    void run();
    return () => {
      stopped = true;
    };
  }, [ready, play]);

  return <div className="fixed inset-0 cursor-none bg-[#04050d]">{frame}</div>;
}
