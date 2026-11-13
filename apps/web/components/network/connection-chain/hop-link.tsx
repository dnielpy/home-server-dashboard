import type { LinkState } from "@/components/network/connection-chain/hop-state";
import { HOP_DURATION_MS } from "@/components/network/connection-chain/use-chain-sweep";

const FILL_STYLES: Record<Exclude<LinkState, "idle">, string> = {
  // Grows from the previous hop to the next one while the next hop is pinged
  travel: "link-progress bg-amber-500",
  up: "link-flow bg-emerald-500 shadow-[0_0_12px_rgb(16_185_129/0.7)]",
  down: "bg-red-500 shadow-[0_0_12px_rgb(239_68_68/0.7)]",
};

export function HopLink({ state }: { state: LinkState }) {
  return (
    <li
      aria-hidden
      className="ml-[calc(2rem-3px)] h-10 w-1.5 shrink-0 rounded-full md:mt-[calc(2.5rem-3px)] md:ml-0 md:h-1.5 md:w-auto md:min-w-8 md:flex-1"
    >
      <span className="block h-full w-full overflow-hidden rounded-full bg-track">
        {state !== "idle" && (
          <span
            className={`block h-full w-full rounded-full ${FILL_STYLES[state]}`}
            style={state === "travel" ? { animationDuration: `${HOP_DURATION_MS}ms` } : undefined}
          />
        )}
      </span>
    </li>
  );
}
