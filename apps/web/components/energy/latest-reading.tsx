import type { ReactNode } from "react";

import { CardUnavailable } from "@/components/dashboard/card";
import { load } from "@/components/dashboard/load";
import { PowerFlow } from "@/components/energy/power-flow/power-flow";
import { BoltIcon } from "@/components/icons/bolt-icon";
import { Panel } from "@/components/ui/panel";
import { getLatestSummary } from "@/lib/bluetti-api";

const timeFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });

/** The power flow of the Bluetti's latest reading. */
export async function LatestReading() {
  const { data: summary, error } = await load(getLatestSummary);

  let subtitle: ReactNode = "No readings yet";
  if (summary) {
    subtitle = (
      <>
        Last reading: <time dateTime={summary.date}>{timeFormat.format(new Date(summary.date))}</time>
      </>
    );
  }

  return (
    <Panel id="power-flow-title" title="Power flow" subtitle={error ? undefined : subtitle} Icon={BoltIcon} accent="emerald">
      {error !== undefined ? (
        <div className="flex min-h-80">
          <CardUnavailable message={error} />
        </div>
      ) : summary ? (
        <div className="flex justify-center py-2">
          <PowerFlow summary={summary} />
        </div>
      ) : (
        <p className="py-20 text-center text-sm text-muted">The first reading will appear once the API stores a summary.</p>
      )}
    </Panel>
  );
}

export function LatestReadingSkeleton() {
  return (
    <div className="glass flex w-full flex-col items-center gap-4 rounded-3xl p-5 xl:p-6">
      <div className="shimmer h-8 w-48 self-start rounded-xl bg-track" />
      <div className="flex aspect-square w-[min(100%,620px,calc(100dvh-14rem))] items-center justify-center">
        <div className="shimmer h-40 w-40 rounded-full border-[14px] border-track" />
      </div>
    </div>
  );
}
