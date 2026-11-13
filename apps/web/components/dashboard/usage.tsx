import { Meter } from "@/components/ui/meter";

// Past this the bar turns red, to catch a disk or the memory about to fill up
const HIGH_PERCENT = 90;

/** A share of a resource in use as a bar, red when it is nearly full. */
export function UsageMeter({ percent, delay }: { percent: number; delay?: number }) {
  return (
    <Meter
      percent={percent}
      className="h-2"
      delay={delay}
      barClassName={percent >= HIGH_PERCENT ? "bg-linear-to-r from-orange-400 to-red-500" : undefined}
    />
  );
}
