/**
 * The server's clock in the browser. Many devices here have their own an hour off: their time zone went to UTC−5 and
 * people moved the clock forward by hand to see Cuba's UTC−4, which leaves their UTC an hour ahead. So the pages ask
 * the server once for its time and count from it instead.
 */

let skewMs = 0;
let synced: Promise<void> | null = null;

/** Now on the server's clock, in ms. The first call asks the server; until it answers it is the device's own. */
export function serverNow(): number {
  if (typeof window !== "undefined") void syncServerClock();
  return Date.now() + skewMs;
}

/** Asks the server for its time once per page load; later calls get the same promise. Never rejects. */
export function syncServerClock(): Promise<void> {
  synced ??= (async () => {
    try {
      const sent = Date.now();
      const response = await fetch("/api/time", { cache: "no-store" });
      const { now }: { now: number } = await response.json();
      // Half the round trip went by since the server read its clock
      skewMs = now - (sent + Date.now()) / 2;
    } catch {
      // Without an answer the device's clock is the best there is; try again on the next call
      synced = null;
    }
  })();
  return synced;
}
