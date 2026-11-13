import { LiveSpeed } from "@/components/dashboard/live-speed";
import { load } from "@/components/dashboard/load";
import { getSpeedTest } from "@/lib/api";

/** The Nano's speed live, with the last speed test Home Net ran under it. */
export async function NetworkSpeedCard() {
  // Without the speed test the live speed still works; only its line is left out
  const { data } = await load(getSpeedTest);
  return <LiveSpeed speedTest={data ?? null} />;
}
