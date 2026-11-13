import { GlobeIcon } from "@/components/icons/globe-icon";

/** Replaces the hop chain once a check reaches internet: one green ball that floats, glows and sparkles. */
export function ConnectedBadge({ animate }: { animate: boolean }) {
  return (
    <div role="img" aria-label="Connected: every hop answers" className={animate ? "connected-enter" : undefined}>
      <div className="connected-float relative flex h-32 w-32 items-center justify-center md:h-36 md:w-36">
        <span aria-hidden className="connected-ripple absolute inset-0 rounded-full bg-emerald-500/40" />
        <div className="connected-glow relative flex h-full w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-full bg-linear-to-br from-emerald-400 to-emerald-600 text-white ring-8 ring-emerald-500/20">
          {/* A band of light that sweeps across the ball */}
          <span aria-hidden className="connected-shine absolute inset-0" />
          <GlobeIcon className="relative h-10 w-10 md:h-12 md:w-12" />
          <span className="relative text-base font-semibold tracking-wide md:text-lg">Connected</span>
        </div>
      </div>
    </div>
  );
}
