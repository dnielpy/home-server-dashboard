import { load } from "@/components/dashboard/load";
import { getBattery, getLocalTube, getNetworkUsage } from "@/lib/api";

function Pill({ name, up }: { name: string; up: boolean }) {
  return (
    <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-foreground">
      <span
        aria-hidden
        className={`pulse-dot h-2 w-2 ${up ? "text-emerald-500" : "text-red-500"}`}
      />
      {name}
      <span className="sr-only">{up ? "is up" : "is not answering"}</span>
    </span>
  );
}

/** Whether each app answers, from the same requests the cards make (cache() shares them). */
export async function SourceStatus() {
  const [bluetti, homenet, localtube] = await Promise.all([
    load(getBattery),
    load(getNetworkUsage),
    load(getLocalTube),
  ]);
  return (
    <div className="flex flex-wrap gap-2">
      <Pill name="Bluetti" up={bluetti.error === undefined} />
      <Pill name="Home Net" up={homenet.error === undefined} />
      <Pill name="LocalTube" up={localtube.error === undefined} />
    </div>
  );
}

export function SourceStatusSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      {["Bluetti", "Home Net", "LocalTube"].map((name) => (
        <span key={name} className="glass shimmer inline-flex rounded-full px-3 py-1.5 text-xs text-muted">
          {name}
        </span>
      ))}
    </div>
  );
}
