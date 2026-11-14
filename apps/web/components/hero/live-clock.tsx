"use client";

import { useEffect, useState } from "react";

import { serverNow, syncServerClock } from "@/lib/server-clock";
import { TIME_ZONE, wallClock } from "@/lib/time-zone";

const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

function greeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 19) return "Good afternoon";
  return "Good evening";
}

/** The greeting, date and time on the dashboard's clock (TIME_ZONE), ticking every few seconds. Rendered after mount,
 * once it knows the server's clock, so a device whose own clock is off never shows its time. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date(serverNow()));
    syncServerClock().then(() => {
      if (cancelled) return;
      tick();
      id = setInterval(tick, 5_000);
    });
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="min-h-16">
      <p className="text-base text-muted sm:text-lg">{now ? `${greeting(wallClock(now).getUTCHours())} · ${dateFormat.format(now)}` : " "}</p>
      <p className="mt-1 bg-linear-to-r from-foreground to-muted bg-clip-text text-6xl font-semibold tracking-tight text-transparent leading-none tabular-nums sm:text-7xl xl:text-9xl">
        {now ? timeFormat.format(now) : " "}
      </p>
    </div>
  );
}
