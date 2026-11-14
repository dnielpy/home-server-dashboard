/**
 * The time zone every time on the dashboard is shown and grouped in, whatever the browser's or the server's is.
 * Cuba stayed on UTC−4 in November 2026, but the tz database (and so America/Havana in browsers) moved it to UTC−5.
 * Etc/GMT+4 is UTC−4 all year: the sign of the Etc zones is the other way around.
 */
export const TIME_ZONE = "Etc/GMT+4";

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** How far the zone's clock is ahead of UTC at that moment, in ms. */
function offsetMs(t: number): number {
  const parts = Object.fromEntries(partsFormat.formatToParts(t).map((part) => [part.type, Number(part.value)]));
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - Math.floor(t / 1000) * 1000;
}

/** The zone's clock at that moment, as a Date whose UTC fields (getUTCHours…) are the zone's hour, day… */
export function wallClock(t: number | Date): Date {
  const time = typeof t === "number" ? t : t.getTime();
  return new Date(time + offsetMs(time));
}

/**
 * Moves a moment on the zone's clock: `adjust` changes the wall clock with the UTC setters (setUTCHours(0, 0, 0, 0)
 * for its midnight, setUTCDate(getUTCDate() + 1) for the next day…) and the moment it then shows is returned.
 */
export function onWallClock(t: number | Date, adjust: (wall: Date) => void): number {
  const wall = wallClock(t);
  adjust(wall);
  const guess = wall.getTime() - offsetMs(wall.getTime());
  return wall.getTime() - offsetMs(guess);
}
