"use client";

import { useEffect, useState } from "react";

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

/** The greeting, date and time on the dashboard's clock (TIME_ZONE), ticking every few seconds. Rendered after mount
 * so the server's clock never shows. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
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
