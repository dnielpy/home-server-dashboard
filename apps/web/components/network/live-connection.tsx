import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { TrafficIcon } from "@/components/icons/traffic-icon";
import { ConnectionChain } from "@/components/network/connection-chain/connection-chain";
import { Panel } from "@/components/ui/panel";
import { getHops, getLatestCheck } from "@/lib/homenet-api";

/** The hops from the router to internet, as the server's latest check found them. */
export async function LiveConnection() {
  const { data, error } = await load(() => Promise.all([getHops(), getLatestCheck()]));

  return (
    <Panel id="connection-title" title="Connection chain" subtitle="Router → Nano → Provider → Internet" Icon={TrafficIcon} accent="sky">
      {error !== undefined ? <CardUnavailable message={error} /> : <ConnectionChain hops={data[0]} latest={data[1]} />}
    </Panel>
  );
}

export function LiveConnectionSkeleton() {
  return (
    <div aria-hidden className="glass flex w-full flex-col items-center gap-10 rounded-3xl p-5 xl:p-6">
      <div className="shimmer h-8 w-48 self-start rounded-xl bg-track" />
      <div className="shimmer h-12 w-56 rounded-xl bg-track" />
      <div className="flex w-full max-w-4xl flex-col gap-10 md:flex-row md:justify-between">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="shimmer h-20 w-20 rounded-2xl bg-track" />
        ))}
      </div>
    </div>
  );
}
